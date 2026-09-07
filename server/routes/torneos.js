const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireRole, requireAccesoTorneo } = require('../middleware/auth');
const { esPotenciaDeDos, generarRoundRobin } = require('../fixture');
const { crearEsqueletoCompleto } = require('../clasificacion');
const { registrar } = require('../bitacora');
const { estadoFinalizacion } = require('../estadoTorneo');
const { MODALIDADES_VALIDAS } = require('../modalidades');
const { guardarReglas: guardarReglasSancion, obtenerReglas: obtenerReglasSancion } = require('../sanciones');

const router = express.Router();

function slugify(texto) {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function generarSlugUnico(nombre) {
  const base = slugify(nombre) || 'torneo';
  let slug = base;
  let intento = 1;
  while (true) {
    const { rows } = await pool.query('SELECT 1 FROM torneos WHERE slug = $1', [slug]);
    if (!rows[0]) return slug;
    intento++;
    slug = `${base}-${intento}`;
  }
}

// Un campeonato queda "bloqueado" (no se puede cambiar el formato liga/grupos)
// apenas se registra el primer resultado, sea del fixture, de un grupo o de la
// eliminatoria.
async function formatosBloqueados(torneoIds) {
  const { rows } = await pool.query(
    "SELECT DISTINCT torneo_id FROM partidos WHERE torneo_id = ANY($1::int[]) AND estado = 'jugado'",
    [torneoIds]
  );
  return new Set(rows.map((r) => r.torneo_id));
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  let rows;
  if (req.usuario.rol === 'admin') {
    ({ rows } = await pool.query('SELECT * FROM torneos ORDER BY creado_en DESC'));
  } else {
    ({ rows } = await pool.query(
      `SELECT t.* FROM torneos t
       JOIN torneo_arbitros ta ON ta.torneo_id = t.id
       WHERE ta.usuario_id = $1
       ORDER BY t.creado_en DESC`,
      [req.usuario.id]
    ));
  }
  const bloqueados = await formatosBloqueados(rows.map((t) => t.id));

  const conEstado = [];
  for (const t of rows) {
    const { finalizado, fechaFin } = await estadoFinalizacion(pool, t);
    conEstado.push({ ...t, formato_bloqueado: bloqueados.has(t.id), finalizado, fecha_finalizado: fechaFin });
  }

  // Activos primero (los que aún no han terminado); los finalizados quedan abajo,
  // como recuerdo/historial, ordenados por cuándo terminaron de verdad (más
  // reciente primero) en vez de borrarlos.
  conEstado.sort((a, b) => {
    if (a.finalizado !== b.finalizado) return a.finalizado ? 1 : -1;
    if (a.finalizado) return new Date(b.fecha_finalizado) - new Date(a.fecha_finalizado);
    return new Date(b.creado_en) - new Date(a.creado_en);
  });

  res.json(conEstado);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM torneos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Torneo no encontrado' });
  const bloqueados = await formatosBloqueados([rows[0].id]);
  res.json({ ...rows[0], formato_bloqueado: bloqueados.has(rows[0].id) });
}));

// Solo tiene efecto sobre un campeonato ya finalizado: decide si sigue apareciendo
// en el hub público (/en-vivo) como historial, o se oculta de ahí. Uno en curso o
// por comenzar no se puede ocultar — siempre debe verse.
router.patch('/:id/visibilidad-publica', requireAuth, requireAccesoTorneo((req) => req.params.id), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM torneos WHERE id = $1', [req.params.id]);
  const torneo = rows[0];
  if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

  const { finalizado } = await estadoFinalizacion(pool, torneo);
  if (!finalizado) return res.status(400).json({ error: 'Solo se puede ocultar un campeonato ya finalizado' });

  const { rows: actualizado } = await pool.query(
    'UPDATE torneos SET oculto_en_publico = $1 WHERE id = $2 RETURNING oculto_en_publico',
    [!!req.body.oculto, req.params.id]
  );
  res.json(actualizado[0]);
}));

router.get('/:id/reglas', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM reglas_edad WHERE torneo_id = $1 ORDER BY id', [req.params.id]);
  res.json(rows);
}));

// Reglas de sanción configuradas para este torneo (fechas obligatorias y multa de
// cada tipo de tarjeta). Siempre devuelve los 4 tipos, completando con los
// defaults los que el torneo no haya personalizado — así el formulario de edición
// siempre tiene algo que mostrar.
router.get('/:id/reglas-sancion', asyncHandler(async (req, res) => {
  const reglas = await obtenerReglasSancion(pool, req.params.id);
  res.json(Object.entries(reglas).map(([tipo_sancion, r]) => ({
    tipo_sancion, fechas_obligatorias: r.fechas, multa: r.multa
  })));
}));

// Tabla de goleadores y de sanciones (amarillas/rojas/azules) de todo el torneo,
// contando lo acumulado en liga + fases (grupos/eliminatoria). Se arma en vivo a
// partir de partido_goles/partido_tarjetas, no hay que ir guardando nada aparte:
// cada gol y cada tarjeta ya queda ligado al jugador y, via partidos.torneo_id, al
// torneo — esta consulta simplemente los agrupa.
router.get('/:id/estadisticas', asyncHandler(async (req, res) => {
  const { rows: goleadores } = await pool.query(
    `SELECT j.id AS jugador_id, j.nombre AS jugador_nombre, e.id AS equipo_id, e.nombre AS equipo_nombre,
            count(*) AS goles
     FROM partido_goles g
     JOIN partidos p ON p.id = g.partido_id
     JOIN jugadores j ON j.id = g.jugador_id
     JOIN equipos e ON e.id = j.equipo_id
     WHERE p.torneo_id = $1 AND g.en_propia_puerta = false
     GROUP BY j.id, j.nombre, e.id, e.nombre
     ORDER BY goles DESC, jugador_nombre`,
    [req.params.id]
  );

  const { rows: sanciones } = await pool.query(
    `SELECT j.id AS jugador_id, j.nombre AS jugador_nombre, e.id AS equipo_id, e.nombre AS equipo_nombre,
            count(*) FILTER (WHERE t.tipo = 'amarilla') AS amarillas,
            count(*) FILTER (WHERE t.tipo = 'roja') AS rojas,
            count(*) FILTER (WHERE t.tipo = 'azul') AS azules
     FROM partido_tarjetas t
     JOIN partidos p ON p.id = t.partido_id
     JOIN jugadores j ON j.id = t.jugador_id
     JOIN equipos e ON e.id = j.equipo_id
     WHERE p.torneo_id = $1
     GROUP BY j.id, j.nombre, e.id, e.nombre
     ORDER BY rojas DESC, amarillas DESC, jugador_nombre`,
    [req.params.id]
  );

  res.json({
    goleadores: goleadores.map((g) => ({ ...g, goles: Number(g.goles) })),
    sanciones: sanciones.map((s) => ({ ...s, amarillas: Number(s.amarillas), rojas: Number(s.rojas), azules: Number(s.azules) }))
  });
}));

// Historial de sorteos de desempate ya realizados en este campeonato: en qué grupo
// (o en la tabla general si no hay grupo_id), qué equipos estaban empatados, en qué
// orden salió el sorteo, y quiénes lo presenciaron.
router.get('/:id/sorteos', requireAuth, requireAccesoTorneo((req) => req.params.id), asyncHandler(async (req, res) => {
  const { rows: sorteos } = await pool.query(
    `SELECT sd.*, g.nombre AS grupo_nombre
     FROM sorteos_desempate sd
     LEFT JOIN grupos g ON g.id = sd.grupo_id
     WHERE sd.torneo_id = $1
     ORDER BY sd.creado_en DESC`,
    [req.params.id]
  );

  const idsInvolucrados = [...new Set(sorteos.flatMap((s) => s.equipos_ids))];
  let nombresPorId = new Map();
  if (idsInvolucrados.length > 0) {
    const { rows: equipos } = await pool.query('SELECT id, nombre FROM equipos WHERE id = ANY($1)', [idsInvolucrados]);
    nombresPorId = new Map(equipos.map((e) => [e.id, e.nombre]));
  }

  res.json(sorteos.map((s) => ({
    id: s.id,
    grupo_nombre: s.grupo_nombre || 'Tabla general',
    equipos: s.equipos_ids.map((id) => nombresPorId.get(id) || `Equipo #${id}`),
    orden_resultado: s.orden_resultado.map((id) => nombresPorId.get(id) || `Equipo #${id}`),
    delegados_presentes: s.delegados_presentes,
    creado_en: s.creado_en
  })));
}));

router.post('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const {
    nombre, modalidad, duracion_tiempo_1, duracion_tiempo_2, fecha_inicio, fecha_fin, logo_url,
    inscripciones_desde, inscripciones_hasta, max_jugadores, min_jugadores, organizador, telefono_organizador, reglas,
    reglas_sancion
  } = req.body;

  if (!nombre || !modalidad) {
    return res.status(400).json({ error: 'nombre y modalidad son obligatorios' });
  }
  if (!MODALIDADES_VALIDAS.includes(modalidad)) {
    return res.status(400).json({ error: `modalidad debe ser una de: ${MODALIDADES_VALIDAS.join(', ')}` });
  }

  const slug = await generarSlugUnico(nombre);

  const { rows } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, duracion_tiempo_1, duracion_tiempo_2, fecha_inicio, fecha_fin, logo_url, inscripciones_desde, inscripciones_hasta, max_jugadores, min_jugadores, organizador, telefono_organizador)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [nombre, slug, modalidad, duracion_tiempo_1 || 45, duracion_tiempo_2 || 45, fecha_inicio || null, fecha_fin || null,
     logo_url || null, inscripciones_desde || null, inscripciones_hasta || null, max_jugadores || 10, min_jugadores || 7,
     organizador || null, telefono_organizador || null]
  );
  const torneo = rows[0];

  if (Array.isArray(reglas)) {
    for (const r of reglas) {
      if (!r.ambito || !r.edad_minima || !r.cantidad_minima) continue;
      await pool.query(
        `INSERT INTO reglas_edad (torneo_id, ambito, edad_minima, cantidad_minima, descripcion)
         VALUES ($1, $2, $3, $4, $5)`,
        [torneo.id, r.ambito, r.edad_minima, r.cantidad_minima, r.descripcion || null]
      );
    }
  }

  await guardarReglasSancion(pool, torneo.id, reglas_sancion);

  await registrar(pool, { torneoId: torneo.id, usuarioId: req.usuario.id, accion: `Creó el campeonato "${torneo.nombre}"` });

  res.status(201).json(torneo);
}));

router.patch('/:id', requireAuth, requireAccesoTorneo((req) => req.params.id, ['organizador']), asyncHandler(async (req, res) => {
  const {
    nombre, modalidad, duracion_tiempo_1, duracion_tiempo_2, fecha_inicio, fecha_fin, logo_url,
    inscripciones_desde, inscripciones_hasta, max_jugadores, min_jugadores, organizador, telefono_organizador, reglas,
    reglas_sancion
  } = req.body;

  if (!nombre || !modalidad) {
    return res.status(400).json({ error: 'nombre y modalidad son obligatorios' });
  }
  if (!MODALIDADES_VALIDAS.includes(modalidad)) {
    return res.status(400).json({ error: `modalidad debe ser una de: ${MODALIDADES_VALIDAS.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE torneos SET nombre = $1, modalidad = $2, duracion_tiempo_1 = $3, duracion_tiempo_2 = $4,
       fecha_inicio = $5, fecha_fin = $6, logo_url = $7, inscripciones_desde = $8, inscripciones_hasta = $9,
       max_jugadores = $10, min_jugadores = $11, organizador = $12, telefono_organizador = $13
     WHERE id = $14 RETURNING *`,
    [nombre, modalidad, duracion_tiempo_1 || 45, duracion_tiempo_2 || 45, fecha_inicio || null, fecha_fin || null,
     logo_url || null, inscripciones_desde || null, inscripciones_hasta || null, max_jugadores || 10, min_jugadores || 7,
     organizador || null, telefono_organizador || null, req.params.id]
  );
  const torneo = rows[0];
  if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

  if (Array.isArray(reglas)) {
    await pool.query('DELETE FROM reglas_edad WHERE torneo_id = $1', [torneo.id]);
    for (const r of reglas) {
      if (!r.ambito || !r.edad_minima || !r.cantidad_minima) continue;
      await pool.query(
        `INSERT INTO reglas_edad (torneo_id, ambito, edad_minima, cantidad_minima, descripcion)
         VALUES ($1, $2, $3, $4, $5)`,
        [torneo.id, r.ambito, r.edad_minima, r.cantidad_minima, r.descripcion || null]
      );
    }
  }

  if (reglas_sancion !== undefined) {
    await guardarReglasSancion(pool, torneo.id, reglas_sancion);
  }

  await registrar(pool, { torneoId: torneo.id, usuarioId: req.usuario.id, accion: `Editó los datos del campeonato "${torneo.nombre}"` });

  res.json(torneo);
}));

// Configura de una sola vez cómo se juega el campeonato (liga o grupos, y si habrá
// fase eliminatoria después) y genera el fixture/los grupos/el cuadro completo de la
// eliminatoria (con casillas "por definir" hasta que se sepa quién clasifica). Solo
// se puede correr una vez: si ya hay fases o partidos, hay que borrar primero.
router.post('/:id/generar-fixture', requireAuth, requireAccesoTorneo((req) => req.params.id, ['organizador']), asyncHandler(async (req, res) => {
  const torneoId = req.params.id;
  const {
    formato, ida_vuelta, grupos_cantidad, grupos_clasifican, grupos_mejores_terceros, grupos_intergrupo,
    grupos_ida_vuelta, tiene_eliminatoria, elim_clasifican, elim_tercer_puesto, elim_modo, elim_ida_vuelta
  } = req.body;

  const { rows: torneoRows } = await pool.query('SELECT * FROM torneos WHERE id = $1', [torneoId]);
  if (!torneoRows[0]) return res.status(404).json({ error: 'Torneo no encontrado' });

  if (!['liga', 'grupos'].includes(formato)) {
    return res.status(400).json({ error: 'Elige cómo se juega el campeonato: Liga o Grupos' });
  }

  const yaExiste = await pool.query(
    `SELECT (SELECT count(*) FROM partidos WHERE torneo_id = $1) + (SELECT count(*) FROM fases WHERE torneo_id = $1) AS total`,
    [torneoId]
  );
  if (Number(yaExiste.rows[0].total) > 0) {
    return res.status(400).json({ error: 'Este campeonato ya tiene su fixture configurado. Bórralo primero si quieres cambiar la configuración.' });
  }

  let totalClasificadosElim = null;
  if (formato === 'grupos') {
    if (!grupos_cantidad || grupos_cantidad < 2 || !grupos_clasifican || grupos_clasifican < 1) {
      return res.status(400).json({ error: 'Define el número de grupos (mínimo 2) y cuántos clasifican por grupo' });
    }
  }
  if (tiene_eliminatoria) {
    totalClasificadosElim = formato === 'grupos'
      ? (grupos_cantidad * grupos_clasifican) + (grupos_mejores_terceros || 0)
      : elim_clasifican;
    if (!totalClasificadosElim) {
      return res.status(400).json({ error: 'Define cuántos equipos clasifican a la fase eliminatoria' });
    }
    if (!esPotenciaDeDos(totalClasificadosElim)) {
      return res.status(400).json({ error: `Con esos números clasifican ${totalClasificadosElim} equipos, y eso no arma un cruce parejo. Debe dar 2, 4, 8 o 16.` });
    }
  }

  await pool.query(
    `UPDATE torneos SET formato = $1, ida_vuelta = $2, grupos_cantidad = $3, grupos_clasifican = $4, grupos_mejores_terceros = $5,
       tiene_eliminatoria = $6, elim_clasifican = $7, elim_tercer_puesto = $8, elim_modo = $9, elim_ida_vuelta = $10, fixture_generado = true
     WHERE id = $11`,
    [
      formato, formato === 'liga' ? !!ida_vuelta : false,
      formato === 'grupos' ? grupos_cantidad : null, formato === 'grupos' ? grupos_clasifican : null,
      formato === 'grupos' ? (grupos_mejores_terceros || 0) : 0,
      !!tiene_eliminatoria, formato === 'liga' ? elim_clasifican : null, !!elim_tercer_puesto, elim_modo || 'sembrado',
      !!elim_ida_vuelta,
      torneoId
    ]
  );

  let equiposLigaGenerados = 0;
  if (formato === 'liga') {
    const { rows: equipos } = await pool.query(
      "SELECT id FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
      [torneoId]
    );
    if (equipos.length >= 2) {
      const partidos = generarRoundRobin(equipos.map((e) => e.id), !!ida_vuelta);
      for (const p of partidos) {
        await pool.query(
          'INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id) VALUES ($1, $2, $3, $4)',
          [torneoId, p.jornada, p.equipo_local_id, p.equipo_visitante_id]
        );
      }
      equiposLigaGenerados = equipos.length;
    }
  }

  let faseGruposId = null;
  if (formato === 'grupos') {
    const { rows } = await pool.query(
      `INSERT INTO fases (torneo_id, nombre, tipo, clasifican, mejores_terceros, intergrupo, ida_vuelta, orden) VALUES ($1, 'Fase de grupos', 'grupos', $2, $3, $4, $5, 1) RETURNING id`,
      [torneoId, grupos_clasifican, grupos_mejores_terceros || 0, !!grupos_intergrupo, !!grupos_ida_vuelta]
    );
    faseGruposId = rows[0].id;
    const letras = 'ABCDEFGHIJKLMNOP';
    for (let i = 0; i < grupos_cantidad; i++) {
      await pool.query('INSERT INTO grupos (fase_id, nombre) VALUES ($1, $2)', [faseGruposId, `Grupo ${letras[i] || i + 1}`]);
    }
  }

  if (tiene_eliminatoria) {
    const { rows } = await pool.query(
      `INSERT INTO fases (torneo_id, nombre, tipo, clasifican, fase_origen_id, clasifican_de_fixture, jugar_tercer_puesto, modo, elim_ida_vuelta, orden)
       VALUES ($1, 'Fase eliminatoria', 'eliminacion', $2, $3, $4, $5, $6, $7, 2) RETURNING *`,
      [torneoId, totalClasificadosElim, faseGruposId, formato === 'liga', !!elim_tercer_puesto, elim_modo || 'sembrado', !!elim_ida_vuelta]
    );
    await crearEsqueletoCompleto(pool, rows[0], totalClasificadosElim);
  }

  await registrar(pool, {
    torneoId: torneoId, usuarioId: req.usuario.id,
    accion: `Configuró el fixture: ${formato === 'grupos' ? `Grupos (${grupos_cantidad} grupos, clasifican ${grupos_clasifican})` : 'Liga'}${tiene_eliminatoria ? `, con eliminatoria (${totalClasificadosElim} clasificados)` : ''}`
  });

  res.status(201).json({
    ok: true,
    fixture_liga_generado: equiposLigaGenerados > 0,
    aviso: formato === 'liga' && equiposLigaGenerados === 0
      ? 'Todavía no hay al menos 2 equipos aprobados: cuando los apruebes, vuelve aquí y genera el fixture con el botón de la sección Fixture.'
      : null
  });
}));

// Borra toda la configuración del fixture (fases, grupos, partidos) para poder
// volver a configurar desde cero. Solo mientras no se haya jugado nada.
router.delete('/:id/fixture', requireAuth, requireAccesoTorneo((req) => req.params.id, ['organizador']), asyncHandler(async (req, res) => {
  const bloqueados = await formatosBloqueados([req.params.id]);
  if (bloqueados.has(Number(req.params.id))) {
    return res.status(400).json({ error: 'Ya se jugó al menos un partido: no se puede borrar la configuración del fixture' });
  }

  await pool.query('DELETE FROM partidos WHERE torneo_id = $1', [req.params.id]);
  await pool.query('DELETE FROM fases WHERE torneo_id = $1', [req.params.id]);
  await pool.query(
    `UPDATE torneos SET fixture_generado = false, formato = NULL, grupos_cantidad = NULL, grupos_clasifican = NULL,
       grupos_mejores_terceros = 0, tiene_eliminatoria = false, elim_clasifican = NULL, elim_tercer_puesto = false
     WHERE id = $1`,
    [req.params.id]
  );

  await registrar(pool, { torneoId: req.params.id, usuarioId: req.usuario.id, accion: 'Borró la configuración del fixture para reconfigurar desde cero' });

  res.json({ ok: true });
}));

module.exports = router;
