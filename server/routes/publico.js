const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const upload = require('../middleware/upload');
const { subirImagen, usaSupabase } = require('../storage');
const { validarReglasPlanilla } = require('../reglas');
const { estadoPublicoTorneo } = require('../estadoTorneo');
const { calcularSanciones, calcularExpulsiones } = require('../sanciones');
const { inscripcionLimiter, codigoAccesoLimiter, uploadPublicoLimiter, visitaLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const RUTAS_VISITA_VALIDAS = ['inicio', 'en_vivo', 'campeonato', 'partido', 'inscripcion'];

// Conteo interno de uso — no requiere sesión (lo dispara cualquier visitante
// público). A propósito no guarda IP ni nada identificable, solo qué pantalla
// se abrió y a qué campeonato pertenece.
router.post('/visita', visitaLimiter, asyncHandler(async (req, res) => {
  const { ruta, torneo_id } = req.body;
  if (!RUTAS_VISITA_VALIDAS.includes(ruta)) return res.status(400).json({ error: 'Ruta inválida' });

  await pool.query('INSERT INTO visitas (ruta, torneo_id) VALUES ($1, $2)', [ruta, torneo_id || null]);
  res.status(201).json({ ok: true });
}));

// Una vez armado el fixture con los equipos ya aprobados, sumar un equipo nuevo
// ya no es seguro (quedaría fuera del calendario) — así que las inscripciones se
// consideran cerradas apenas eso pasa, sin importar si la fecha de cierre
// configurada todavía no llegó.
function estadoInscripciones(torneo) {
  if (torneo.fixture_generado) return 'cerrada';
  const ahora = new Date();
  if (torneo.inscripciones_desde && ahora < new Date(torneo.inscripciones_desde)) return 'no_abierta';
  if (torneo.inscripciones_hasta && ahora > new Date(torneo.inscripciones_hasta)) return 'cerrada';
  return 'abierta';
}

// Estado del campeonato en sí (distinto del estado de inscripciones), según sus fechas
// de inicio/cierre. Lo usan la planilla pública y, más adelante, la vista en vivo.
function estadoCampeonato(torneo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (torneo.fecha_inicio && hoy < new Date(torneo.fecha_inicio)) return 'no_iniciado';
  if (torneo.fecha_fin && hoy > new Date(torneo.fecha_fin)) return 'finalizado';
  if (torneo.fecha_inicio || torneo.fecha_fin) return 'en_curso';
  return 'sin_definir';
}

function generarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I/L)
  let codigo = '';
  for (let i = 0; i < 7; i++) codigo += alfabeto[crypto.randomInt(alfabeto.length)];
  return codigo;
}

async function buscarTorneoPorSlug(slug) {
  const { rows } = await pool.query('SELECT * FROM torneos WHERE slug = $1', [slug]);
  return rows[0];
}

// Datos mínimos indispensables: si faltan, no hay nada que guardar.
function validarDatosBasicos(equipo, jugadores) {
  if (!equipo?.nombre) return 'El nombre del equipo es obligatorio';
  if (!equipo?.delegado_telefono) return 'El teléfono del delegado es obligatorio';
  if (!Array.isArray(jugadores) || jugadores.length === 0) return 'Agrega al menos un jugador';
  for (const j of jugadores) {
    if (!j.nombre || !j.fecha_nacimiento) return 'Cada jugador necesita nombre y fecha de nacimiento';
    if (!j.cedula) return 'Cada jugador necesita número de documento de identidad';
  }
  return null;
}

// Reglas del campeonato (cupo mínimo/máximo y edades): si no cumplen, igual se guarda como
// "rechazado" con el motivo, para que el delegado corrija con su código sin perder lo cargado.
function validarReglasTorneo(jugadores, torneo, reglas) {
  if (jugadores.length > torneo.max_jugadores) {
    return `La planilla admite un máximo de ${torneo.max_jugadores} jugadores (hay ${jugadores.length}).`;
  }
  if (jugadores.length < torneo.min_jugadores) {
    return `La planilla necesita al menos ${torneo.min_jugadores} jugadores inscritos (hay ${jugadores.length}).`;
  }
  const fechaReferencia = torneo.fecha_inicio || new Date();
  return validarReglasPlanilla(jugadores, reglas, fechaReferencia);
}

// Un jugador o un delegado no puede repetirse en dos equipos del MISMO campeonato
// (sí puede estar en otros campeonatos distintos, eso no se revisa acá).
async function buscarDuplicado(torneoId, equipoIdExcluir, equipo, jugadores) {
  const excluir = equipoIdExcluir || 0;

  const cedulas = jugadores.map((j) => j.cedula).filter(Boolean);
  if (cedulas.length) {
    const { rows } = await pool.query(
      `SELECT j.cedula, e.nombre AS equipo_nombre FROM jugadores j
       JOIN equipos e ON e.id = j.equipo_id
       WHERE e.torneo_id = $1 AND e.id != $2 AND j.cedula = ANY($3::text[])
       LIMIT 1`,
      [torneoId, excluir, cedulas]
    );
    if (rows[0]) {
      return `El jugador con documento ${rows[0].cedula} ya está inscrito en el equipo "${rows[0].equipo_nombre}" de este campeonato.`;
    }
  }

  if (equipo?.delegado_telefono) {
    const { rows } = await pool.query(
      `SELECT nombre FROM equipos WHERE torneo_id = $1 AND id != $2 AND delegado_telefono = $3 LIMIT 1`,
      [torneoId, excluir, equipo.delegado_telefono]
    );
    if (rows[0]) {
      return `Ese teléfono de delegado ya está registrado con el equipo "${rows[0].nombre}" en este campeonato.`;
    }
  }

  return null;
}

// Lista de campeonatos para el hub público (resultados en vivo): solo los que ya
// tienen fixture generado (los demás no tienen partidos que mostrar todavía). A
// cada uno se le calcula su estado real ('proximamente' / 'en_curso' /
// 'finalizado') a partir de los resultados cargados — un finalizado que el admin
// marcó como oculto ni siquiera se devuelve, para que no quede dando vueltas
// indefinidamente en el hub público.
router.get('/torneos', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, slug, modalidad, formato, logo_url, oculto_en_publico, fixture_generado FROM torneos WHERE fixture_generado = true ORDER BY creado_en DESC`
  );

  const conEstado = [];
  for (const t of rows) {
    const { estado, fechaFin } = await estadoPublicoTorneo(pool, t);
    if (estado === 'finalizado' && t.oculto_en_publico) continue;
    conEstado.push({
      id: t.id, nombre: t.nombre, slug: t.slug, modalidad: t.modalidad, formato: t.formato, logo_url: t.logo_url,
      estado, fecha_finalizado: fechaFin
    });
  }

  conEstado.sort((a, b) => {
    if (a.estado !== b.estado) return (a.estado === 'finalizado' ? 1 : 0) - (b.estado === 'finalizado' ? 1 : 0);
    if (a.estado === 'finalizado') return new Date(b.fecha_finalizado) - new Date(a.fecha_finalizado);
    return 0;
  });

  res.json(conEstado);
}));

// Campeonatos con inscripciones abiertas AHORA MISMO, para la pantalla de
// bienvenida pública (usa el mismo estadoInscripciones que ya gobierna el
// formulario real, así que un campeonato con fixture ya generado nunca
// aparece acá — ver el comentario en esa función).
router.get('/torneos-inscripciones-abiertas', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, slug, modalidad, formato, logo_url, fixture_generado, inscripciones_desde, inscripciones_hasta
     FROM torneos
     WHERE inscripciones_hasta IS NULL OR inscripciones_hasta >= now()
     ORDER BY inscripciones_desde ASC NULLS LAST`
  );
  const abiertos = rows
    .filter((t) => estadoInscripciones(t) === 'abierta')
    .map((t) => ({
      id: t.id, nombre: t.nombre, slug: t.slug, modalidad: t.modalidad, formato: t.formato, logo_url: t.logo_url,
      inscripciones_hasta: t.inscripciones_hasta
    }));
  res.json(abiertos);
}));

router.get('/torneos/:slug', asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });

  const { rows: reglas } = await pool.query(
    "SELECT ambito, edad_minima, cantidad_minima, descripcion FROM reglas_edad WHERE torneo_id = $1 AND ambito = 'planilla'",
    [torneo.id]
  );

  res.json({
    id: torneo.id,
    nombre: torneo.nombre,
    slug: torneo.slug,
    modalidad: torneo.modalidad,
    formato: torneo.formato,
    fixture_generado: torneo.fixture_generado,
    logo_url: torneo.logo_url,
    fecha_inicio: torneo.fecha_inicio,
    fecha_fin: torneo.fecha_fin,
    inscripciones_desde: torneo.inscripciones_desde,
    inscripciones_hasta: torneo.inscripciones_hasta,
    max_jugadores: torneo.max_jugadores,
    min_jugadores: torneo.min_jugadores,
    organizador: torneo.organizador,
    telefono_organizador: torneo.telefono_organizador,
    grupo_whatsapp: torneo.grupo_whatsapp,
    reglamento_url: torneo.reglamento_url,
    estado_inscripciones: estadoInscripciones(torneo),
    estado_campeonato: estadoCampeonato(torneo),
    reglas
  });
}));

// Sanciones activas del campeonato (jugadores que no pueden jugar el próximo
// partido de su equipo hasta que el organizador los habilite). Vista pública de
// solo lectura — habilitar es una acción de administración.
router.get('/torneos/:slug/sanciones', asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });
  res.json(await calcularSanciones(pool, torneo.id));
}));

// Jugadores expulsados definitivamente del campeonato (falta disciplinaria grave)
// y si el equipo ya se puso al día con la multa — vista pública de solo lectura.
router.get('/torneos/:slug/expulsiones', asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });
  res.json(await calcularExpulsiones(pool, torneo.id));
}));

router.get('/torneos/:slug/verificar-cedula', asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });
  const { cedula, equipo_id } = req.query;
  if (!cedula) return res.json({ enUso: false });

  const { rows } = await pool.query(
    `SELECT e.nombre FROM jugadores j JOIN equipos e ON e.id = j.equipo_id
     WHERE e.torneo_id = $1 AND e.id != $2 AND j.cedula = $3 LIMIT 1`,
    [torneo.id, equipo_id || 0, cedula]
  );
  res.json({ enUso: !!rows[0], equipo: rows[0]?.nombre });
}));

router.get('/torneos/:slug/verificar-delegado', asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });
  const { telefono, equipo_id } = req.query;
  if (!telefono) return res.json({ enUso: false });

  const { rows } = await pool.query(
    `SELECT nombre FROM equipos WHERE torneo_id = $1 AND id != $2 AND delegado_telefono = $3 LIMIT 1`,
    [torneo.id, equipo_id || 0, telefono]
  );
  res.json({ enUso: !!rows[0], equipo: rows[0]?.nombre });
}));

router.post('/upload', uploadPublicoLimiter, (req, res) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    try {
      if (usaSupabase()) {
        const url = await subirImagen(req.file.buffer, req.file.originalname, req.file.mimetype);
        return res.status(201).json({ url });
      }
      res.status(201).json({ url: '/uploads/' + req.file.filename });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

router.post('/torneos/:slug/inscripcion', inscripcionLimiter, asyncHandler(async (req, res) => {
  const torneo = await buscarTorneoPorSlug(req.params.slug);
  if (!torneo) return res.status(404).json({ error: 'Campeonato no encontrado' });

  if (estadoInscripciones(torneo) !== 'abierta') {
    return res.status(403).json({ error: 'Las inscripciones para este campeonato no están abiertas' });
  }

  const { equipo, jugadores } = req.body;
  const errorBasico = validarDatosBasicos(equipo, jugadores);
  if (errorBasico) return res.status(400).json({ error: errorBasico });

  const errorDuplicado = await buscarDuplicado(torneo.id, null, equipo, jugadores);
  const { rows: reglas } = await pool.query('SELECT * FROM reglas_edad WHERE torneo_id = $1', [torneo.id]);
  const motivoRechazo = errorDuplicado || validarReglasTorneo(jugadores, torneo, reglas);
  const estadoInicial = motivoRechazo ? 'rechazado' : 'pendiente';

  let codigo_acceso;
  do { codigo_acceso = generarCodigo(); } while ((await pool.query('SELECT 1 FROM equipos WHERE codigo_acceso = $1', [codigo_acceso])).rows[0]);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: equipoRows } = await cliente.query(
      `INSERT INTO equipos (torneo_id, nombre, escudo_url, delegado, delegado_telefono, codigo_acceso, estado, motivo_rechazo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [torneo.id, equipo.nombre, equipo.escudo_url || null, equipo.delegado || null, equipo.delegado_telefono || null,
       codigo_acceso, estadoInicial, motivoRechazo]
    );
    const equipoCreado = equipoRows[0];

    const jugadoresCreados = [];
    for (const j of jugadores) {
      const { rows: jRows } = await cliente.query(
        `INSERT INTO jugadores (equipo_id, nombre, cedula, fecha_nacimiento, numero_camiseta)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [equipoCreado.id, j.nombre, j.cedula, j.fecha_nacimiento, j.numero_camiseta || null]
      );
      jugadoresCreados.push(jRows[0]);
    }

    await cliente.query('COMMIT');
    res.status(201).json({ equipo: equipoCreado, jugadores: jugadoresCreados });
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}));

router.get('/inscripcion/:codigo', codigoAccesoLimiter, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM equipos WHERE codigo_acceso = $1', [req.params.codigo.toUpperCase()]);
  const equipo = rows[0];
  if (!equipo) return res.status(404).json({ error: 'Código no encontrado. Revisa que esté bien escrito.' });

  const { rows: jugadores } = await pool.query(
    'SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY numero_camiseta NULLS LAST, nombre',
    [equipo.id]
  );
  const { rows: torneoRows } = await pool.query('SELECT * FROM torneos WHERE id = $1', [equipo.torneo_id]);
  const torneo = torneoRows[0];

  const { rows: reglas } = await pool.query(
    "SELECT ambito, edad_minima, cantidad_minima, descripcion FROM reglas_edad WHERE torneo_id = $1 AND ambito = 'planilla'",
    [torneo.id]
  );

  res.json({
    equipo,
    jugadores,
    torneo: {
      nombre: torneo.nombre, slug: torneo.slug, logo_url: torneo.logo_url,
      max_jugadores: torneo.max_jugadores, min_jugadores: torneo.min_jugadores,
      organizador: torneo.organizador, telefono_organizador: torneo.telefono_organizador,
      grupo_whatsapp: torneo.grupo_whatsapp, reglamento_url: torneo.reglamento_url,
      fecha_inicio: torneo.fecha_inicio, reglas
    },
    editable: equipo.estado !== 'aprobado' && estadoInscripciones(torneo) === 'abierta'
  });
}));

router.patch('/inscripcion/:codigo', codigoAccesoLimiter, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM equipos WHERE codigo_acceso = $1', [req.params.codigo.toUpperCase()]);
  const equipoActual = rows[0];
  if (!equipoActual) return res.status(404).json({ error: 'Código no encontrado' });

  const { rows: torneoRows } = await pool.query('SELECT * FROM torneos WHERE id = $1', [equipoActual.torneo_id]);
  const torneo = torneoRows[0];

  if (equipoActual.estado === 'aprobado') {
    return res.status(403).json({ error: 'Este equipo ya fue aprobado y no se puede editar' });
  }
  if (estadoInscripciones(torneo) !== 'abierta') {
    return res.status(403).json({ error: 'Las inscripciones para este campeonato ya no están abiertas' });
  }

  const { equipo, jugadores } = req.body;
  const errorBasico = validarDatosBasicos(equipo, jugadores);
  if (errorBasico) return res.status(400).json({ error: errorBasico });

  const errorDuplicado = await buscarDuplicado(torneo.id, equipoActual.id, equipo, jugadores);
  const { rows: reglas } = await pool.query('SELECT * FROM reglas_edad WHERE torneo_id = $1', [torneo.id]);
  const motivoRechazo = errorDuplicado || validarReglasTorneo(jugadores, torneo, reglas);
  const estadoNuevo = motivoRechazo ? 'rechazado' : 'pendiente';

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: equipoRows } = await cliente.query(
      `UPDATE equipos SET nombre = $1, escudo_url = $2, delegado = $3, delegado_telefono = $4, estado = $5, motivo_rechazo = $6
       WHERE id = $7 RETURNING *`,
      [equipo.nombre, equipo.escudo_url || null, equipo.delegado || null, equipo.delegado_telefono || null,
       estadoNuevo, motivoRechazo, equipoActual.id]
    );

    await cliente.query('DELETE FROM jugadores WHERE equipo_id = $1', [equipoActual.id]);

    const jugadoresCreados = [];
    for (const j of jugadores) {
      const { rows: jRows } = await cliente.query(
        `INSERT INTO jugadores (equipo_id, nombre, cedula, fecha_nacimiento, numero_camiseta)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [equipoActual.id, j.nombre, j.cedula, j.fecha_nacimiento, j.numero_camiseta || null]
      );
      jugadoresCreados.push(jRows[0]);
    }

    await cliente.query('COMMIT');
    res.json({ equipo: equipoRows[0], jugadores: jugadoresCreados });
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}));

// Vista pública de un partido en vivo o ya jugado: marcador, cronómetro, y la línea
// de tiempo (goles, tarjetas, cambios) para la página de consulta sin necesidad de
// iniciar sesión. Solo expone lo que un espectador debería ver — nada de datos de
// alineación completa ni información administrativa del torneo.
router.get('/partidos/:id', asyncHandler(async (req, res) => {
  const { rows: partidoRows } = await pool.query(
    `SELECT p.id, p.torneo_id, p.jornada, p.estado, p.tiempo_actual, p.cronometro_inicio, p.cronometro_acumulado_seg,
            p.tiempo1_duracion_real_seg, p.goles_local, p.goles_visitante, p.penales_local, p.penales_visitante,
            p.es_walkover, p.walkover_ausente_id, p.equipo_local_id, p.equipo_visitante_id, p.fecha_hora,
            p.jugado_desde, p.jugado_hasta, p.url_transmision,
            el.nombre AS equipo_local_nombre, el.escudo_url AS equipo_local_escudo,
            ev.nombre AS equipo_visitante_nombre, ev.escudo_url AS equipo_visitante_escudo,
            t.nombre AS torneo_nombre, t.slug AS torneo_slug, t.modalidad, t.duracion_tiempo_1, t.duracion_tiempo_2
     FROM partidos p
     LEFT JOIN equipos el ON el.id = p.equipo_local_id
     LEFT JOIN equipos ev ON ev.id = p.equipo_visitante_id
     JOIN torneos t ON t.id = p.torneo_id
     WHERE p.id = $1`,
    [req.params.id]
  );
  const partido = partidoRows[0];
  if (!partido) return res.status(404).json({ error: 'Partido no encontrado' });

  const { rows: goles } = await pool.query(
    `SELECT g.id, g.equipo_id, g.jugador_id, g.minuto, g.minuto_adicion, g.tiempo, g.en_propia_puerta, j.nombre AS jugador_nombre, COALESCE(pn.numero, j.numero_camiseta) AS jugador_numero
     FROM partido_goles g LEFT JOIN jugadores j ON j.id = g.jugador_id
     LEFT JOIN partido_numero_camiseta pn ON pn.jugador_id = j.id AND pn.partido_id = g.partido_id
     WHERE g.partido_id = $1 ORDER BY g.tiempo NULLS LAST, g.minuto NULLS LAST, g.id`,
    [req.params.id]
  );
  const { rows: tarjetas } = await pool.query(
    `SELECT t.id, t.equipo_id, t.jugador_id, t.minuto, t.minuto_adicion, t.tiempo, t.tipo, j.nombre AS jugador_nombre, COALESCE(pn.numero, j.numero_camiseta) AS jugador_numero
     FROM partido_tarjetas t JOIN jugadores j ON j.id = t.jugador_id
     LEFT JOIN partido_numero_camiseta pn ON pn.jugador_id = j.id AND pn.partido_id = t.partido_id
     WHERE t.partido_id = $1 ORDER BY t.tiempo NULLS LAST, t.minuto NULLS LAST, t.id`,
    [req.params.id]
  );
  const { rows: cambios } = await pool.query(
    `SELECT c.id, c.equipo_id, c.minuto, c.minuto_adicion, c.tiempo,
            js.nombre AS jugador_sale_nombre, COALESCE(pns.numero, js.numero_camiseta) AS jugador_sale_numero,
            je.nombre AS jugador_entra_nombre, COALESCE(pne.numero, je.numero_camiseta) AS jugador_entra_numero
     FROM partido_cambios c JOIN jugadores js ON js.id = c.jugador_sale_id JOIN jugadores je ON je.id = c.jugador_entra_id
     LEFT JOIN partido_numero_camiseta pns ON pns.jugador_id = js.id AND pns.partido_id = c.partido_id
     LEFT JOIN partido_numero_camiseta pne ON pne.jugador_id = je.id AND pne.partido_id = c.partido_id
     WHERE c.partido_id = $1 ORDER BY c.tiempo NULLS LAST, c.minuto NULLS LAST, c.id`,
    [req.params.id]
  );
  const { rows: hitos } = await pool.query(
    'SELECT id, tipo, minuto, minuto_adicion, tiempo FROM partido_hitos WHERE partido_id = $1 ORDER BY id',
    [req.params.id]
  );

  // Si el resultado de este partido fue corregido después de finalizado (por un
  // reclamo, una sanción, etc.), el público debe poder ver por qué quedó así — no
  // solo el marcador ajustado, que ya viene en `partido` arriba.
  const { rows: ultimaEdicion } = await pool.query(
    `SELECT goles_local_anterior, goles_visitante_anterior, goles_local_nuevo, goles_visitante_nuevo, motivo, creado_en
     FROM partido_ediciones WHERE partido_id = $1 ORDER BY id DESC LIMIT 1`,
    [req.params.id]
  );

  res.json({ partido, goles, tarjetas, cambios, hitos, correccion: ultimaEdicion[0] || null });
}));

module.exports = router;
