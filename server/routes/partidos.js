const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');
const { generarRoundRobin, calcularPosiciones, barajar, proyectarPartidosEnCurso, equiposEnVivo } = require('../fixture');
const { intentarLlenarPrimeraRonda, obtenerSorteos } = require('../clasificacion');
const { registrar } = require('../bitacora');
const { aplicarBajaEquipo } = require('../bajas');
const { guardarResultadoFinal } = require('../resultados');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  const { rows } = await pool.query(
    `SELECT p.*, t.duracion_tiempo_1, t.duracion_tiempo_2,
            el.nombre AS equipo_local_nombre, el.escudo_url AS equipo_local_escudo,
            ev.nombre AS equipo_visitante_nombre, ev.escudo_url AS equipo_visitante_escudo
     FROM partidos p
     JOIN torneos t ON t.id = p.torneo_id
     JOIN equipos el ON el.id = p.equipo_local_id
     JOIN equipos ev ON ev.id = p.equipo_visitante_id
     WHERE p.torneo_id = $1 AND p.fase_id IS NULL
     ORDER BY p.jornada, p.id`,
    [torneo_id]
  );
  res.json(rows);
}));

router.get('/posiciones', asyncHandler(async (req, res) => {
  const { torneo_id, en_vivo } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });

  const { rows: equipos } = await pool.query(
    "SELECT id, nombre, escudo_url, estado_torneo, baja_motivo FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
    [torneo_id]
  );
  const { rows: partidos } = await pool.query('SELECT * FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL', [torneo_id]);
  const sorteos = await obtenerSorteos(pool, torneo_id, null);

  const tabla = calcularPosiciones(equipos, en_vivo ? proyectarPartidosEnCurso(partidos) : partidos, sorteos);
  if (en_vivo) {
    const enVivoIds = equiposEnVivo(partidos);
    tabla.forEach((f) => { f.en_vivo = enVivoIds.has(f.equipo_id); });
  }
  res.json(tabla);
}));

// Sortea el orden de 2 o más equipos que quedaron exactamente empatados en la tabla
// general de liga. Verifica en vivo que ese conjunto todavía esté empatado.
router.post('/sorteos', requireAuth, requireAccesoTorneo((req) => req.body.torneo_id), asyncHandler(async (req, res) => {
  const { torneo_id, equipos_ids, delegados_presentes } = req.body;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  if (!Array.isArray(equipos_ids) || equipos_ids.length < 2) {
    return res.status(400).json({ error: 'equipos_ids debe tener al menos 2 equipos' });
  }
  if (!delegados_presentes?.trim()) {
    return res.status(400).json({ error: 'Indica los delegados presentes en el sorteo' });
  }

  const { rows: equipos } = await pool.query(
    "SELECT id, nombre, escudo_url FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
    [torneo_id]
  );
  const { rows: partidos } = await pool.query('SELECT * FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL', [torneo_id]);
  const sorteosPrevios = await obtenerSorteos(pool, torneo_id, null);
  const tabla = calcularPosiciones(equipos, partidos, sorteosPrevios);

  const idsSet = new Set(equipos_ids.map(Number));
  const clave = [...idsSet].sort((a, b) => a - b).join('-');
  const encontrados = tabla.filter((f) => f.requiere_sorteo && idsSet.has(f.equipo_id));
  if (encontrados.length !== idsSet.size || encontrados.some((f) => f.grupo_empate !== clave)) {
    return res.status(400).json({ error: 'Ese conjunto de equipos ya no está empatado, o no coincide con un empate pendiente de sorteo' });
  }

  const orden = barajar([...idsSet]);
  await pool.query(
    `INSERT INTO sorteos_desempate (torneo_id, grupo_id, equipos_ids, orden_resultado, delegados_presentes, creado_por)
     VALUES ($1, NULL, $2, $3, $4, $5)`,
    [torneo_id, [...idsSet], orden, delegados_presentes.trim(), req.usuario.id]
  );

  const nombresPorId = new Map(equipos.map((e) => [e.id, e.nombre]));
  await registrar(pool, {
    torneoId: torneo_id, usuarioId: req.usuario.id,
    accion: `Sorteó el desempate entre ${[...idsSet].map((id) => nombresPorId.get(id)).join(', ')} — orden: ${orden.map((id) => nombresPorId.get(id)).join(' > ')} — delegados presentes: ${delegados_presentes.trim()}`
  });

  res.status(201).json({ ok: true, orden_resultado: orden, orden_resultado_nombres: orden.map((id) => nombresPorId.get(id)) });
}));

router.post('/generar', requireAuth, requireAccesoTorneo((req) => req.body.torneo_id), asyncHandler(async (req, res) => {
  const { torneo_id } = req.body;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });

  const existentes = await pool.query('SELECT 1 FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL LIMIT 1', [torneo_id]);
  if (existentes.rows[0]) {
    return res.status(400).json({ error: 'Este campeonato ya tiene un fixture generado' });
  }

  const { rows: equipos } = await pool.query(
    "SELECT id FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
    [torneo_id]
  );
  if (equipos.length < 2) {
    return res.status(400).json({ error: 'Necesitas al menos 2 equipos aprobados para generar el fixture' });
  }

  const { rows: torneoRows } = await pool.query('SELECT ida_vuelta FROM torneos WHERE id = $1', [torneo_id]);
  const partidos = generarRoundRobin(equipos.map((e) => e.id), !!torneoRows[0]?.ida_vuelta);
  for (const p of partidos) {
    await pool.query(
      'INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id) VALUES ($1, $2, $3, $4)',
      [torneo_id, p.jornada, p.equipo_local_id, p.equipo_visitante_id]
    );
  }

  res.status(201).json({ generados: partidos.length });
}));

router.delete('/torneo/:torneoId', requireAuth, requireAccesoTorneo((req) => req.params.torneoId), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL', [req.params.torneoId]);
  res.json({ ok: true });
}));

router.get('/:id/ediciones', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pe.*, u.nombre AS editado_por_nombre
     FROM partido_ediciones pe
     LEFT JOIN usuarios u ON u.id = pe.editado_por
     WHERE pe.partido_id = $1
     ORDER BY pe.creado_en DESC`,
    [req.params.id]
  );
  res.json(rows);
}));

router.patch('/:id/horario', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM partidos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  const { fecha_hora } = req.body;

  const { rows: actuales } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const actual = actuales[0];
  if (!actual) return res.status(404).json({ error: 'Partido no encontrado' });
  if (actual.estado === 'jugado') {
    return res.status(400).json({ error: 'Este partido ya se jugó, no se puede reprogramar' });
  }

  // Si ya tenía una fecha programada y se le pone una distinta, queda marcado como
  // "reprogramado" para que se note que cambió; si es la primera vez, queda "programado".
  const nuevaEstado = actual.fecha_hora && fecha_hora ? 'reprogramado' : 'programado';

  const { rows } = await pool.query(
    'UPDATE partidos SET fecha_hora = $1, estado = $2 WHERE id = $3 RETURNING *',
    [fecha_hora || null, nuevaEstado, req.params.id]
  );
  const partido = rows[0];

  const { rows: nombresRows } = await pool.query(
    'SELECT el.nombre AS local, ev.nombre AS visitante FROM equipos el, equipos ev WHERE el.id = $1 AND ev.id = $2',
    [partido.equipo_local_id, partido.equipo_visitante_id]
  );
  const nombres = nombresRows[0] || {};
  const fechaTexto = fecha_hora ? new Date(fecha_hora).toLocaleString('es-CO') : null;

  await registrar(pool, {
    torneoId: partido.torneo_id, usuarioId: req.usuario.id,
    accion: !fecha_hora
      ? `Quitó la fecha programada de ${nombres.local || '?'} vs ${nombres.visitante || '?'}`
      : nuevaEstado === 'reprogramado'
        ? `Reprogramó ${nombres.local || '?'} vs ${nombres.visitante || '?'} para ${fechaTexto}`
        : `Programó ${nombres.local || '?'} vs ${nombres.visitante || '?'} para ${fechaTexto}`
  });

  res.json(partido);
}));

// Enlace de transmisión en vivo de este partido (ej. un video "Unlisted" de
// YouTube Live). Es opcional y por partido: si viene vacío, se quita.
router.patch('/:id/transmision', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM partidos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  const { url_transmision } = req.body;
  const { rows } = await pool.query(
    'UPDATE partidos SET url_transmision = $1 WHERE id = $2 RETURNING *',
    [url_transmision?.trim() || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Partido no encontrado' });
  res.json(rows[0]);
}));

// Marca un partido de liga o de grupos como definido por walkover (el equipo
// ausente pierde 3-0). Si con este ya suma 2 walkovers en el torneo, el equipo
// queda descalificado automáticamente y se le resuelven por walkover todos sus
// demás partidos pendientes de liga/grupos.
router.patch('/:id/walkover', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM partidos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  const equipo_ausente_id = Number(req.body.equipo_ausente_id);

  const { rows: actuales } = await pool.query('SELECT * FROM partidos WHERE id = $1', [req.params.id]);
  const actual = actuales[0];
  if (!actual) return res.status(404).json({ error: 'Partido no encontrado' });
  if (actual.estado === 'jugado') return res.status(400).json({ error: 'Este partido ya tiene un resultado cargado' });
  if (!actual.equipo_local_id || !actual.equipo_visitante_id) {
    return res.status(400).json({ error: 'Todavía no se sabe qué equipos juegan este partido' });
  }
  if (actual.fase_id) {
    const { rows: faseRows } = await pool.query('SELECT tipo FROM fases WHERE id = $1', [actual.fase_id]);
    if (faseRows[0]?.tipo !== 'grupos') {
      return res.status(400).json({ error: 'El walkover solo aplica a partidos de liga o de fase de grupos' });
    }
  }
  if (![actual.equipo_local_id, actual.equipo_visitante_id].includes(equipo_ausente_id)) {
    return res.status(400).json({ error: 'El equipo ausente debe ser uno de los dos equipos del partido' });
  }

  const ausenteEsLocal = equipo_ausente_id === actual.equipo_local_id;
  const { rows } = await pool.query(
    `UPDATE partidos SET goles_local = $1, goles_visitante = $2, estado = 'jugado', es_walkover = true, walkover_ausente_id = $3
     WHERE id = $4 RETURNING *`,
    [ausenteEsLocal ? 0 : 3, ausenteEsLocal ? 3 : 0, equipo_ausente_id, req.params.id]
  );
  const partido = rows[0];

  const { rows: nombresRows } = await pool.query(
    'SELECT el.nombre AS local, ev.nombre AS visitante FROM equipos el, equipos ev WHERE el.id = $1 AND ev.id = $2',
    [partido.equipo_local_id, partido.equipo_visitante_id]
  );
  const nombres = nombresRows[0] || {};
  const nombreAusente = ausenteEsLocal ? nombres.local : nombres.visitante;
  const nombreRival = ausenteEsLocal ? nombres.visitante : nombres.local;

  await registrar(pool, {
    torneoId: partido.torneo_id, usuarioId: req.usuario.id,
    accion: `Walkover: ${nombreAusente} no se presentó — ${nombreRival} gana 3-0`
  });

  // Si con este ya son 2 walkovers de este equipo en el torneo, queda descalificado solo.
  const { rows: conteo } = await pool.query(
    `SELECT count(*) FROM partidos WHERE torneo_id = $1 AND walkover_ausente_id = $2`,
    [partido.torneo_id, equipo_ausente_id]
  );
  let descalificado = null;
  if (Number(conteo[0].count) >= 2) {
    const resultado = await aplicarBajaEquipo(
      pool, equipo_ausente_id, 'descalificado',
      'Dos inasistencias (doble walkover)', req.usuario.id
    );
    if (resultado.ok) descalificado = resultado;
  }

  // Si este resultado alimenta la primera ronda de una eliminatoria, la completa
  // igual que con cualquier otro resultado cargado.
  let avisoClasificacion = null;
  if (!partido.fase_id) {
    avisoClasificacion = (await intentarLlenarPrimeraRonda(pool, partido.torneo_id, null))?.advertencia || null;
  } else {
    const { rows: faseDelPartido } = await pool.query('SELECT tipo FROM fases WHERE id = $1', [partido.fase_id]);
    if (faseDelPartido[0]?.tipo === 'grupos') {
      avisoClasificacion = (await intentarLlenarPrimeraRonda(pool, partido.torneo_id, partido.fase_id))?.advertencia || null;
    }
  }

  res.json({ ...partido, descalificado, aviso_clasificacion: avisoClasificacion });
}));

router.patch('/:id', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM partidos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  const { goles_local, goles_visitante, penales_local, penales_visitante, motivo } = req.body;

  const resultado = await guardarResultadoFinal(pool, {
    partidoId: req.params.id, golesLocal: goles_local, golesVisitante: goles_visitante,
    penalesLocal: penales_local, penalesVisitante: penales_visitante, motivo, usuarioId: req.usuario.id
  });
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });

  res.json({ ...resultado.partido, aviso_clasificacion: resultado.avisoClasificacion });
}));

module.exports = router;
