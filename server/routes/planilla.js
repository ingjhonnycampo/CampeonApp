const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');
const { registrar } = require('../bitacora');
const { guardarResultadoFinal } = require('../resultados');
const { maxTitulares, usaAlineacionFormal, permiteTarjetaAzul } = require('../modalidades');
const { jugadoresSuspendidosParaPartido, equiposConMultaPendiente, jugadoresExpulsadosDelTorneo } = require('../sanciones');

const router = express.Router();

async function obtenerTorneoIdDePartido(partidoId) {
  const { rows } = await pool.query('SELECT torneo_id FROM partidos WHERE id = $1', [partidoId]);
  return rows[0]?.torneo_id;
}

// Solo el arbitro/anotador puede cargar o corregir la planilla. Admin y organizador
// (que sí tienen acceso de torneo, incluido admin que pasa siempre) solo pueden
// consultarla (GET) — nunca gestionarla.
function soloArbitro(req, res, next) {
  if (req.usuario.rol !== 'arbitro') {
    return res.status(403).json({ error: 'Solo el árbitro/anotador puede gestionar la planilla. Un admin u organizador solo puede consultarla.' });
  }
  next();
}

// Un jugador queda expulsado (no puede seguir jugando ni recibir mas nada) si ya
// tiene una tarjeta roja directa, o si esta es su segunda amarilla del partido.
async function estaExpulsado(partidoId, jugadorId) {
  const { rows } = await pool.query(
    `SELECT tipo, count(*) AS cantidad FROM partido_tarjetas WHERE partido_id = $1 AND jugador_id = $2 GROUP BY tipo`,
    [partidoId, jugadorId]
  );
  // Roja directa, doble amarilla o tarjeta azul (cambio obligatorio): en los tres
  // casos el jugador no puede seguir haciendo nada mas en el partido.
  return rows.some((r) => r.tipo === 'roja' || r.tipo === 'azul') ||
    rows.some((r) => r.tipo === 'amarilla' && Number(r.cantidad) >= 2);
}

// Cuantos titulares como maximo puede tener un equipo segun la modalidad del torneo.

// El minuto de cada evento (gol, tarjeta, cambio) es SIEMPRE relativo al tiempo en
// que ocurre (10' del primer tiempo, 15' del segundo), nunca un minuto corrido de
// partido — y lo calcula el servidor a partir del cronometro real en ese instante,
// no lo que mande el cliente. Si el cronometro no esta corriendo un tiempo (antes
// del partido o en descanso), el evento queda sin minuto ni tiempo.
// Si el cronómetro ya superó la duración reglamentaria configurada para ese
// tiempo (torneos.duracion_tiempo_1/2), el partido queda en "tiempo de adición":
// `minuto` se congela en esa duración y `minutoAdicion` lleva lo que va corrido
// desde que se cumplió — así un evento en ese momento queda como "20+3", no
// como un minuto 23 corrido. Necesita que `partido` traiga duracion_tiempo_1/2
// (join con torneos) además de los campos propios del cronómetro.
function minutoYTiempoActual(partido) {
  const tiempo = ['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) ? partido.tiempo_actual : null;
  if (!tiempo) return { minuto: null, minutoAdicion: null, tiempo: null };
  const corriendo = !!partido.cronometro_inicio;
  const segundosCorridos = corriendo ? Math.floor((Date.now() - new Date(partido.cronometro_inicio).getTime()) / 1000) : 0;
  const totalSeg = (partido.cronometro_acumulado_seg || 0) + segundosCorridos;
  const duracionMin = tiempo === 'primer_tiempo' ? partido.duracion_tiempo_1 : partido.duracion_tiempo_2;
  const duracionSeg = (duracionMin || 0) * 60;
  if (!duracionSeg || totalSeg < duracionSeg) {
    return { minuto: minutoDesdeSegundos(totalSeg), minutoAdicion: null, tiempo };
  }
  return { minuto: duracionMin, minutoAdicion: minutoDesdeSegundos(totalSeg - duracionSeg), tiempo };
}

// Convención futbolística: el minuto 1 va de 0:00 a 0:59, el minuto 2 de 1:00 a
// 1:59, y así — nunca "minuto 0". Un gol al segundo 150 (2:30) es del minuto 3,
// no del 2.
function minutoDesdeSegundos(totalSeg) {
  return Math.floor(totalSeg / 60) + 1;
}

// Todo lo que necesita la pantalla de la planilla: datos del partido, la
// convocatoria de cada equipo (jugadores validados), quién quedó en la
// alineación (si ya se armó), y los goles/tarjetas registrados hasta ahora.
router.get('/:id', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, el.nombre AS equipo_local_nombre, el.escudo_url AS equipo_local_escudo,
            ev.nombre AS equipo_visitante_nombre, ev.escudo_url AS equipo_visitante_escudo,
            t.modalidad, t.duracion_tiempo_1, t.duracion_tiempo_2, t.nombre AS torneo_nombre,
            u.nombre AS firmado_por_nombre
     FROM partidos p
     LEFT JOIN equipos el ON el.id = p.equipo_local_id
     LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
     LEFT JOIN usuarios u ON u.id = p.firmado_por
     JOIN torneos t ON t.id = p.torneo_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!partido.equipo_local_id || !partido.equipo_visitante_id) {
    return res.status(400).json({ error: 'Todavía no se sabe qué equipos juegan este partido' });
  }

  const { rows: convocadosLocalRows } = await pool.query(
    `SELECT id, nombre, numero_camiseta FROM jugadores WHERE equipo_id = $1 AND estado_validacion != 'rechazado' ORDER BY numero_camiseta NULLS LAST, nombre`,
    [partido.equipo_local_id]
  );
  const { rows: convocadosVisitanteRows } = await pool.query(
    `SELECT id, nombre, numero_camiseta FROM jugadores WHERE equipo_id = $1 AND estado_validacion != 'rechazado' ORDER BY numero_camiseta NULLS LAST, nombre`,
    [partido.equipo_visitante_id]
  );
  const suspendidos = await jugadoresSuspendidosParaPartido(pool, partido.torneo_id, partido.id);
  const expulsados = await jugadoresExpulsadosDelTorneo(pool, partido.torneo_id);
  const convocadosLocal = convocadosLocalRows.map((j) => ({ ...j, suspendido: suspendidos.has(j.id), expulsado: expulsados.has(j.id) }));
  const convocadosVisitante = convocadosVisitanteRows.map((j) => ({ ...j, suspendido: suspendidos.has(j.id), expulsado: expulsados.has(j.id) }));

  const { rows: alineacion } = await pool.query('SELECT * FROM partido_alineacion WHERE partido_id = $1', [req.params.id]);
  const { rows: goles } = await pool.query(
    `SELECT g.*, j.nombre AS jugador_nombre FROM partido_goles g LEFT JOIN jugadores j ON j.id = g.jugador_id
     WHERE g.partido_id = $1 ORDER BY g.minuto NULLS LAST, g.id`,
    [req.params.id]
  );
  const { rows: tarjetas } = await pool.query(
    `SELECT t.*, j.nombre AS jugador_nombre FROM partido_tarjetas t JOIN jugadores j ON j.id = t.jugador_id
     WHERE t.partido_id = $1 ORDER BY t.minuto NULLS LAST, t.id`,
    [req.params.id]
  );
  const { rows: cambios } = await pool.query(
    `SELECT c.*, js.nombre AS jugador_sale_nombre, je.nombre AS jugador_entra_nombre
     FROM partido_cambios c
     JOIN jugadores js ON js.id = c.jugador_sale_id
     JOIN jugadores je ON je.id = c.jugador_entra_id
     WHERE c.partido_id = $1 ORDER BY c.minuto NULLS LAST, c.id`,
    [req.params.id]
  );
  const { rows: hitos } = await pool.query(
    'SELECT * FROM partido_hitos WHERE partido_id = $1 ORDER BY id',
    [req.params.id]
  );

  res.json({ partido, convocadosLocal, convocadosVisitante, alineacion, goles, tarjetas, cambios, hitos });
}));

// Arma (o reemplaza) la alineación de UN equipo para este partido: titulares y
// suplentes. Se puede repetir mientras el partido no esté en curso o jugado.
router.put('/:id/alineacion', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { equipo_id, titulares, suplentes } = req.body;
  if (!equipo_id || !Array.isArray(titulares) || !Array.isArray(suplentes)) {
    return res.status(400).json({ error: 'equipo_id, titulares y suplentes son obligatorios' });
  }

  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.modalidad FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado === 'jugado') return res.status(400).json({ error: 'Este partido ya se jugó' });
  if (![partido.equipo_local_id, partido.equipo_visitante_id].includes(Number(equipo_id))) {
    return res.status(400).json({ error: 'Ese equipo no juega este partido' });
  }
  const equiposBloqueados = await equiposConMultaPendiente(pool, partido.torneo_id);
  if (equiposBloqueados.has(Number(equipo_id))) {
    return res.status(400).json({ error: 'Este equipo tiene una multa de expulsión sin pagar — no puede jugar hasta que se confirme el pago' });
  }
  const lado = Number(equipo_id) === partido.equipo_local_id ? 'local' : 'visitante';
  if (!partido[lado === 'local' ? 'firma_delegado_local' : 'firma_delegado_visitante']) {
    return res.status(400).json({ error: 'El delegado de este equipo debe firmar la planilla antes de guardar la alineación' });
  }
  const repetidos = titulares.filter((id) => suplentes.includes(id));
  if (repetidos.length > 0) return res.status(400).json({ error: 'Un jugador no puede estar de titular y de suplente a la vez' });
  const tope = maxTitulares(partido.modalidad);
  if (tope && titulares.length > tope) {
    return res.status(400).json({ error: `No puede haber más de ${tope} titulares` });
  }

  const suspendidos = await jugadoresSuspendidosParaPartido(pool, partido.torneo_id, partido.id);
  const conSancion = [...titulares, ...suplentes].filter((id) => suspendidos.has(id));
  if (conSancion.length > 0) {
    return res.status(400).json({ error: 'Hay jugadores en la lista que están sancionados y no pueden jugar este partido hasta que se habiliten' });
  }

  await pool.query('DELETE FROM partido_alineacion WHERE partido_id = $1 AND equipo_id = $2', [req.params.id, equipo_id]);
  for (const jugadorId of titulares) {
    await pool.query(
      'INSERT INTO partido_alineacion (partido_id, equipo_id, jugador_id, titular) VALUES ($1, $2, $3, true)',
      [req.params.id, equipo_id, jugadorId]
    );
  }
  for (const jugadorId of suplentes) {
    await pool.query(
      'INSERT INTO partido_alineacion (partido_id, equipo_id, jugador_id, titular) VALUES ($1, $2, $3, false)',
      [req.params.id, equipo_id, jugadorId]
    );
  }

  res.json({ ok: true });
}));

// Arranca el partido: pasa a "en_curso" y deja el marcador en 0-0 para que los
// goles que se vayan registrando lo sumen solos.
router.post('/:id/iniciar', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.modalidad FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado === 'jugado') return res.status(400).json({ error: 'Este partido ya se jugó' });
  if (partido.estado === 'en_curso') return res.status(400).json({ error: 'Este partido ya está en curso' });

  if (!partido.fecha_hora) {
    return res.status(400).json({ error: 'Este partido todavía no tiene fecha y hora programada' });
  }
  if (new Date(partido.fecha_hora) > new Date()) {
    const fechaTexto = new Date(partido.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    return res.status(400).json({ error: `Todavía no llega la hora programada de este partido (${fechaTexto})` });
  }

  const equiposBloqueados = await equiposConMultaPendiente(pool, partido.torneo_id);
  if (equiposBloqueados.has(partido.equipo_local_id) || equiposBloqueados.has(partido.equipo_visitante_id)) {
    return res.status(400).json({ error: 'Uno de los dos equipos tiene una multa de expulsión sin pagar — no puede jugar hasta que se confirme el pago' });
  }

  if (usaAlineacionFormal(partido.modalidad)) {
    const { rows: conAlineacion } = await pool.query(
      'SELECT DISTINCT equipo_id FROM partido_alineacion WHERE partido_id = $1 AND titular = true',
      [req.params.id]
    );
    const equiposConAlineacion = new Set(conAlineacion.map((r) => r.equipo_id));
    if (!equiposConAlineacion.has(partido.equipo_local_id) || !equiposConAlineacion.has(partido.equipo_visitante_id)) {
      return res.status(400).json({ error: 'Falta armar la alineación titular de alguno de los dos equipos' });
    }
  } else if (!partido.confirmado_local || !partido.confirmado_visitante) {
    return res.status(400).json({ error: 'Falta confirmar alguno de los dos equipos' });
  }

  const { rows } = await pool.query(
    `UPDATE partidos SET estado = 'en_curso', goles_local = 0, goles_visitante = 0, jugado_desde = now() WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  const actualizado = rows[0];

  await registrar(pool, { torneoId: actualizado.torneo_id, usuarioId: req.usuario.id, accion: 'Inició la planilla de un partido' });

  res.json(actualizado);
}));

// Cronometro de la planilla en vivo: primer tiempo -> descanso -> segundo tiempo -> finalizado,
// con pausa/reanudacion dentro de cada tiempo (para tiempo agregado, incidencias, etc).
router.post('/:id/cronometro/iniciar-tiempo', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso' });

  let siguiente;
  if (partido.tiempo_actual === null) siguiente = 'primer_tiempo';
  else if (partido.tiempo_actual === 'descanso') siguiente = 'segundo_tiempo';
  else return res.status(400).json({ error: 'El cronómetro ya está corriendo o el partido ya completó los dos tiempos' });

  const { rows } = await pool.query(
    `UPDATE partidos SET tiempo_actual = $1, cronometro_inicio = now(), cronometro_acumulado_seg = 0 WHERE id = $2 RETURNING *`,
    [siguiente, req.params.id]
  );
  await pool.query(
    `INSERT INTO partido_hitos (partido_id, tipo, minuto, tiempo) VALUES ($1, $2, 1, $3)`,
    [req.params.id, siguiente === 'primer_tiempo' ? 'inicio_partido' : 'inicio_segundo_tiempo', siguiente]
  );
  res.json(rows[0]);
}));

router.post('/:id/cronometro/pausar', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) || !partido.cronometro_inicio) {
    return res.status(400).json({ error: 'El cronómetro no está corriendo' });
  }

  const { rows } = await pool.query(
    `UPDATE partidos SET cronometro_acumulado_seg = cronometro_acumulado_seg + EXTRACT(EPOCH FROM (now() - cronometro_inicio))::INTEGER,
            cronometro_inicio = NULL WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(rows[0]);
}));

router.post('/:id/cronometro/reanudar', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) || partido.cronometro_inicio) {
    return res.status(400).json({ error: 'El cronómetro no está en pausa' });
  }

  const { rows } = await pool.query(
    `UPDATE partidos SET cronometro_inicio = now() WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(rows[0]);
}));

router.post('/:id/cronometro/finalizar-tiempo', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.duracion_tiempo_1, t.duracion_tiempo_2 FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual)) {
    return res.status(400).json({ error: 'No hay un tiempo en curso para finalizar' });
  }

  const eraPrimerTiempo = partido.tiempo_actual === 'primer_tiempo';
  const siguiente = eraPrimerTiempo ? 'descanso' : 'finalizado';
  const { rows } = await pool.query(
    `UPDATE partidos SET
       cronometro_acumulado_seg = cronometro_acumulado_seg + CASE WHEN cronometro_inicio IS NOT NULL THEN EXTRACT(EPOCH FROM (now() - cronometro_inicio))::INTEGER ELSE 0 END,
       cronometro_inicio = NULL,
       tiempo_actual = $1
     WHERE id = $2 RETURNING *`,
    [siguiente, req.params.id]
  );
  let actualizado = rows[0];

  // Guarda cuanto duro realmente el primer tiempo (puede diferir de lo configurado
  // en el torneo si el arbitro lo corto antes o le agrego tiempo), para calcular
  // bien el minuto mostrado durante el segundo tiempo.
  if (eraPrimerTiempo) {
    const { rows: rows2 } = await pool.query(
      `UPDATE partidos SET tiempo1_duracion_real_seg = $1 WHERE id = $2 RETURNING *`,
      [actualizado.cronometro_acumulado_seg, req.params.id]
    );
    actualizado = rows2[0];
  }

  const duracionMin = eraPrimerTiempo ? partido.duracion_tiempo_1 : partido.duracion_tiempo_2;
  const duracionSeg = (duracionMin || 0) * 60;
  const totalSeg = actualizado.cronometro_acumulado_seg;
  const enAdicion = duracionSeg > 0 && totalSeg >= duracionSeg;
  await pool.query(
    `INSERT INTO partido_hitos (partido_id, tipo, minuto, minuto_adicion, tiempo) VALUES ($1, $2, $3, $4, $5)`,
    [
      req.params.id,
      eraPrimerTiempo ? 'fin_primer_tiempo' : 'fin_partido',
      enAdicion ? duracionMin : minutoDesdeSegundos(totalSeg),
      enAdicion ? minutoDesdeSegundos(totalSeg - duracionSeg) : null,
      partido.tiempo_actual
    ]
  );

  res.json(actualizado);
}));

// Registra un gol (o autogol) en vivo y actualiza el marcador solo.
router.post('/:id/gol', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { jugador_id, en_propia_puerta } = req.body;

  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.modalidad, t.duracion_tiempo_1, t.duracion_tiempo_2 FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para anotar goles' });
  if (!['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) || !partido.cronometro_inicio) {
    return res.status(400).json({ error: 'El cronómetro tiene que estar corriendo para anotar un gol' });
  }

  const { rows: jugadorRows } = await pool.query('SELECT * FROM jugadores WHERE id = $1', [jugador_id]);
  const jugador = jugadorRows[0];
  if (!jugador || ![partido.equipo_local_id, partido.equipo_visitante_id].includes(jugador.equipo_id)) {
    return res.status(400).json({ error: 'El jugador debe pertenecer a uno de los dos equipos del partido' });
  }
  if (await estaExpulsado(req.params.id, jugador_id)) {
    return res.status(400).json({ error: 'Este jugador ya fue expulsado y no puede seguir anotando' });
  }
  if ((await jugadoresSuspendidosParaPartido(pool, partido.torneo_id, partido.id)).has(jugador_id)) {
    return res.status(400).json({ error: 'Este jugador está sancionado y no puede jugar este partido' });
  }
  if (usaAlineacionFormal(partido.modalidad)) {
    const { rows: alineacionRows } = await pool.query(
      'SELECT * FROM partido_alineacion WHERE partido_id = $1 AND jugador_id = $2',
      [req.params.id, jugador_id]
    );
    const a = alineacionRows[0];
    const enCancha = a && (a.titular ? a.salio_minuto == null : a.entro_minuto != null);
    if (!enCancha) return res.status(400).json({ error: 'El jugador tiene que estar en la cancha para anotar goles' });
  }

  // Si es en propia puerta, el gol cuenta para el equipo RIVAL del jugador.
  const equipoDelGol = en_propia_puerta
    ? (jugador.equipo_id === partido.equipo_local_id ? partido.equipo_visitante_id : partido.equipo_local_id)
    : jugador.equipo_id;
  const campo = equipoDelGol === partido.equipo_local_id ? 'goles_local' : 'goles_visitante';
  const { minuto, minutoAdicion, tiempo } = minutoYTiempoActual(partido);

  const { rows: golRows } = await pool.query(
    `INSERT INTO partido_goles (partido_id, equipo_id, jugador_id, minuto, minuto_adicion, tiempo, en_propia_puerta) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, equipoDelGol, jugador_id, minuto, minutoAdicion, tiempo, !!en_propia_puerta]
  );
  await pool.query(`UPDATE partidos SET ${campo} = ${campo} + 1 WHERE id = $1`, [req.params.id]);

  res.status(201).json(golRows[0]);
}));

router.delete('/:id/gol/:golId', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para corregir goles' });

  const { rows } = await pool.query('DELETE FROM partido_goles WHERE id = $1 AND partido_id = $2 RETURNING *', [req.params.golId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Ese gol no existe' });

  const campo = rows[0].equipo_id === partido.equipo_local_id ? 'goles_local' : 'goles_visitante';
  await pool.query(`UPDATE partidos SET ${campo} = GREATEST(${campo} - 1, 0) WHERE id = $1`, [req.params.id]);

  res.json({ ok: true });
}));

// Tarjetas amarilla/roja durante el partido.
router.post('/:id/tarjeta', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { jugador_id, tipo } = req.body;
  if (!['amarilla', 'roja', 'azul'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser amarilla, roja o azul' });

  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.modalidad, t.duracion_tiempo_1, t.duracion_tiempo_2 FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para mostrar tarjetas' });
  if (tipo === 'azul' && !permiteTarjetaAzul(partido.modalidad)) {
    return res.status(400).json({ error: 'La tarjeta azul solo se usa en microfútbol y fútbol sala' });
  }

  const { rows: jugadorRows } = await pool.query('SELECT * FROM jugadores WHERE id = $1', [jugador_id]);
  const jugador = jugadorRows[0];
  if (!jugador || ![partido.equipo_local_id, partido.equipo_visitante_id].includes(jugador.equipo_id)) {
    return res.status(400).json({ error: 'El jugador debe pertenecer a uno de los dos equipos del partido' });
  }
  if (await estaExpulsado(req.params.id, jugador_id)) {
    return res.status(400).json({ error: 'Este jugador ya fue expulsado, no se le pueden mostrar más tarjetas' });
  }

  const { minuto, minutoAdicion, tiempo } = minutoYTiempoActual(partido);
  const { rows } = await pool.query(
    `INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, minuto, minuto_adicion, tiempo, tipo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, jugador.equipo_id, jugador_id, minuto, minutoAdicion, tiempo, tipo]
  );
  const tarjeta = rows[0];

  // La segunda amarilla del mismo jugador en el partido equivale a una roja: se le
  // agrega automaticamente la tarjeta roja de expulsion, al mismo minuto.
  let expulsadoPorDobleAmarilla = false;
  if (tipo === 'amarilla') {
    const { rows: countRows } = await pool.query(
      `SELECT count(*) FROM partido_tarjetas WHERE partido_id = $1 AND jugador_id = $2 AND tipo = 'amarilla'`,
      [req.params.id, jugador_id]
    );
    if (Number(countRows[0].count) >= 2) {
      await pool.query(
        `INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, minuto, minuto_adicion, tiempo, tipo, doble_amarilla) VALUES ($1, $2, $3, $4, $5, $6, 'roja', true)`,
        [req.params.id, jugador.equipo_id, jugador_id, minuto, minutoAdicion, tiempo]
      );
      expulsadoPorDobleAmarilla = true;
    }
  }

  res.status(201).json({ ...tarjeta, expulsado_por_doble_amarilla: expulsadoPorDobleAmarilla });
}));

router.delete('/:id/tarjeta/:tarjetaId', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM partido_tarjetas WHERE id = $1 AND partido_id = $2 RETURNING *', [req.params.tarjetaId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Esa tarjeta no existe' });
  res.json({ ok: true });
}));

// Cambio: el que sale queda con su minuto de salida, el que entra queda (o se
// agrega) con su minuto de entrada como suplente que ya jugó.
router.patch('/:id/cambio', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { jugador_sale_id, jugador_entra_id } = req.body;

  const { rows: partidoRows } = await pool.query(
    `SELECT p.*, t.duracion_tiempo_1, t.duracion_tiempo_2 FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para hacer cambios' });
  if (partido.tiempo_actual === null) {
    return res.status(400).json({ error: 'No se pueden hacer cambios antes de iniciar el primer tiempo' });
  }

  const { rows: saleRows } = await pool.query(
    'SELECT equipo_id FROM partido_alineacion WHERE partido_id = $1 AND jugador_id = $2',
    [req.params.id, jugador_sale_id]
  );
  if (!saleRows[0]) return res.status(400).json({ error: 'Ese jugador no está en la alineación de este partido' });
  const equipoId = saleRows[0].equipo_id;
  // Un cambio hecho en el entretiempo (descanso) queda como minuto 1 del segundo
  // tiempo, ya que todavia no ha arrancado el cronometro del segundo tiempo.
  const { minuto, minutoAdicion, tiempo } = partido.tiempo_actual === 'descanso'
    ? { minuto: 1, minutoAdicion: null, tiempo: 'segundo_tiempo' }
    : minutoYTiempoActual(partido);

  await pool.query(
    'UPDATE partido_alineacion SET salio_minuto = $1 WHERE partido_id = $2 AND jugador_id = $3',
    [minuto, req.params.id, jugador_sale_id]
  );
  await pool.query(
    `INSERT INTO partido_alineacion (partido_id, equipo_id, jugador_id, titular, entro_minuto)
     VALUES ($1, $2, $3, false, $4)
     ON CONFLICT (partido_id, jugador_id) DO UPDATE SET entro_minuto = EXCLUDED.entro_minuto`,
    [req.params.id, equipoId, jugador_entra_id, minuto]
  );
  await pool.query(
    `INSERT INTO partido_cambios (partido_id, equipo_id, jugador_sale_id, jugador_entra_id, minuto, minuto_adicion, tiempo) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [req.params.id, equipoId, jugador_sale_id, jugador_entra_id, minuto, minutoAdicion, tiempo]
  );

  res.json({ ok: true });
}));

// Corrige un cambio cargado por error: borra el evento y devuelve a los dos
// jugadores a como estaban antes (el que salió vuelve a quedar en cancha, el que
// entró vuelve a quedar en la banca).
router.delete('/:id/cambio/:cambioId', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para corregir cambios' });

  const { rows } = await pool.query('DELETE FROM partido_cambios WHERE id = $1 AND partido_id = $2 RETURNING *', [req.params.cambioId, req.params.id]);
  const cambio = rows[0];
  if (!cambio) return res.status(404).json({ error: 'Ese cambio no existe' });

  await pool.query('UPDATE partido_alineacion SET salio_minuto = NULL WHERE partido_id = $1 AND jugador_id = $2', [req.params.id, cambio.jugador_sale_id]);
  await pool.query('UPDATE partido_alineacion SET entro_minuto = NULL WHERE partido_id = $1 AND jugador_id = $2', [req.params.id, cambio.jugador_entra_id]);

  res.json({ ok: true });
}));

// Cierra el partido: usa el marcador ya acumulado por los goles registrados (o el
// que se le pase encima) y corre todo lo que corre un resultado normal
// (propagación al cuadro eliminatorio, clasificación, bitácora).
router.post('/:id/finalizar', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { penales_local, penales_visitante } = req.body;

  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'en_curso') return res.status(400).json({ error: 'El partido tiene que estar en curso para finalizarlo' });
  if (partido.tiempo_actual !== 'finalizado') {
    return res.status(400).json({ error: 'Todavía no se ha finalizado el segundo tiempo con el cronómetro' });
  }

  const resultado = await guardarResultadoFinal(pool, {
    partidoId: req.params.id, golesLocal: partido.goles_local, golesVisitante: partido.goles_visitante,
    penalesLocal: penales_local, penalesVisitante: penales_visitante, usuarioId: req.usuario.id
  });
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

  res.json({ ...resultado.partido, aviso_clasificacion: resultado.avisoClasificacion });
}));

// Firma del arbitro/anotador que cierra la planilla, para el informe imprimible.
// Solo se puede firmar un partido ya jugado, y una sola vez (para volver a firmar
// primero hay que pedirle a un admin que la borre, no hay endpoint para eso todavia).
router.post('/:id/firma', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { firma, firmante_nombre, observaciones } = req.body;
  if (!firma || !firma.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'La firma debe ser una imagen PNG' });
  }
  if (!firmante_nombre || !firmante_nombre.trim()) {
    return res.status(400).json({ error: 'Escribe el nombre de quien firma' });
  }

  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (partido.estado !== 'jugado') return res.status(400).json({ error: 'El partido tiene que estar finalizado para firmarlo' });
  if (partido.firma_arbitro) return res.status(400).json({ error: 'Este partido ya tiene una firma registrada' });

  const { rows } = await pool.query(
    `UPDATE partidos SET firma_arbitro = $1, firmado_por = $2, firmante_nombre = $3, firmado_en = now(), observaciones_arbitro = $4 WHERE id = $5 RETURNING *`,
    [firma, req.usuario.id, firmante_nombre.trim(), observaciones || null, req.params.id]
  );
  await registrar(pool, { torneoId: partido.torneo_id, usuarioId: req.usuario.id, accion: 'Firmó la planilla de un partido' });

  res.json(rows[0]);
}));

// Firma de cada delegado de equipo certificando la planilla ANTES de iniciar el
// partido — mismo dispositivo del árbitro (los delegados no inician sesión
// aparte para esto), una sola vez por lado. Es requisito para poder guardar la
// alineación de ese equipo (fútbol) o confirmarlo (microfútbol).
router.post('/:id/firma-delegado', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { lado, firma, firmante_nombre } = req.body;
  if (!['local', 'visitante'].includes(lado)) {
    return res.status(400).json({ error: 'lado debe ser "local" o "visitante"' });
  }
  if (!firma || !firma.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'La firma debe ser una imagen PNG' });
  }
  if (!firmante_nombre || !firmante_nombre.trim()) {
    return res.status(400).json({ error: 'Escribe el nombre de quien firma' });
  }

  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!['programado', 'reprogramado'].includes(partido.estado)) {
    return res.status(400).json({ error: 'La firma del delegado se hace antes de iniciar el partido' });
  }

  const columnaFirma = lado === 'local' ? 'firma_delegado_local' : 'firma_delegado_visitante';
  const columnaNombre = lado === 'local' ? 'firmante_delegado_local' : 'firmante_delegado_visitante';
  const columnaFecha = lado === 'local' ? 'firmado_delegado_local_en' : 'firmado_delegado_visitante_en';
  if (partido[columnaFirma]) return res.status(400).json({ error: 'Este delegado ya firmó la planilla' });

  const { rows } = await pool.query(
    `UPDATE partidos SET ${columnaFirma} = $1, ${columnaNombre} = $2, ${columnaFecha} = now() WHERE id = $3 RETURNING *`,
    [firma, firmante_nombre.trim(), req.params.id]
  );
  await registrar(pool, { torneoId: partido.torneo_id, usuarioId: req.usuario.id, accion: `Firmó la planilla el delegado ${lado === 'local' ? 'local' : 'visitante'}` });

  res.json(rows[0]);
}));

// Confirma un equipo antes de iniciar — solo hace falta en modalidades sin
// alineación formal (microfútbol), donde no hay otro paso que sirva como
// confirmación. Requiere que ese delegado ya haya firmado.
router.post('/:id/confirmar-equipo', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDePartido(req.params.id)), soloArbitro, asyncHandler(async (req, res) => {
  const { lado } = req.body;
  if (!['local', 'visitante'].includes(lado)) {
    return res.status(400).json({ error: 'lado debe ser "local" o "visitante"' });
  }

  const { rows: partidoRows } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });
  if (!['programado', 'reprogramado'].includes(partido.estado)) {
    return res.status(400).json({ error: 'Este partido ya no está en la etapa previa al inicio' });
  }

  const columnaFirma = lado === 'local' ? 'firma_delegado_local' : 'firma_delegado_visitante';
  if (!partido[columnaFirma]) {
    return res.status(400).json({ error: 'El delegado de este equipo debe firmar la planilla antes de confirmar' });
  }

  const columnaConfirmado = lado === 'local' ? 'confirmado_local' : 'confirmado_visitante';
  const { rows } = await pool.query(`UPDATE partidos SET ${columnaConfirmado} = true WHERE id = $1 RETURNING *`, [req.params.id]);

  res.json(rows[0]);
}));

module.exports = router;
