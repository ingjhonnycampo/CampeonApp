const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');
const {
  calcularSanciones, expulsarJugador, marcarMultaExpulsionPagada, calcularExpulsiones,
  crearDisciplinaJugador, marcarMultaDisciplinaJugadorPagada, calcularDisciplinaJugador,
  crearDisciplinaEquipo, marcarMultaDisciplinaEquipoPagada, calcularDisciplinaEquipo
} = require('../sanciones');
const { registrar } = require('../bitacora');

const router = express.Router();

router.get('/', requireAuth, requireAccesoTorneo((req) => req.query.torneo_id), asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  res.json(await calcularSanciones(pool, torneo_id));
}));

// Habilita al jugador (queda registrado que ya pagó la multa de esa tarjeta). Solo
// el organizador o el admin lo pueden hacer — el árbitro/anotador no gestiona esto.
router.post('/:tarjetaId/habilitar', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query(
    `SELECT p.torneo_id FROM partido_tarjetas t JOIN partidos p ON p.id = t.partido_id WHERE t.id = $1`,
    [req.params.tarjetaId]
  );
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  if (req.usuario.rol === 'arbitro') {
    return res.status(403).json({ error: 'Solo el organizador o el admin pueden habilitar a un jugador sancionado' });
  }

  const { rows: tarjetaRows } = await pool.query(
    `SELECT t.*, j.nombre AS jugador_nombre, p.torneo_id
     FROM partido_tarjetas t JOIN jugadores j ON j.id = t.jugador_id JOIN partidos p ON p.id = t.partido_id
     WHERE t.id = $1`,
    [req.params.tarjetaId]
  );
  const tarjeta = tarjetaRows[0];
  if (!tarjeta) return res.status(404).json({ error: 'Esa tarjeta no existe' });

  await pool.query(
    `INSERT INTO sancion_habilitaciones (tarjeta_id, habilitado_por) VALUES ($1, $2)
     ON CONFLICT (tarjeta_id) DO NOTHING`,
    [req.params.tarjetaId, req.usuario.id]
  );

  await registrar(pool, {
    torneoId: tarjeta.torneo_id, usuarioId: req.usuario.id,
    accion: `Habilitó a ${tarjeta.jugador_nombre} (sanción por tarjeta ${tarjeta.tipo}) tras confirmar el pago`
  });

  res.json({ ok: true });
}));

router.get('/expulsiones', requireAuth, requireAccesoTorneo((req) => req.query.torneo_id), asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  res.json(await calcularExpulsiones(pool, torneo_id));
}));

// Expulsa a un jugador del campeonato por una falta disciplinaria grave (una
// tarjeta no alcanza). Solo organizador/admin. El equipo queda bloqueado para
// jugar hasta que se marque la multa como pagada.
router.post('/expulsar', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query(
    `SELECT e.torneo_id FROM jugadores j JOIN equipos e ON e.id = j.equipo_id WHERE j.id = $1`,
    [req.body.jugador_id]
  );
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  if (req.usuario.rol === 'arbitro') {
    return res.status(403).json({ error: 'Solo el organizador o el admin pueden expulsar a un jugador del campeonato' });
  }
  const { jugador_id, motivo, multa } = req.body;
  if (!jugador_id || !motivo?.trim()) {
    return res.status(400).json({ error: 'jugador_id y motivo son obligatorios' });
  }

  const { rows: jugadorRows } = await pool.query(
    `SELECT j.nombre, e.nombre AS equipo_nombre, e.torneo_id FROM jugadores j JOIN equipos e ON e.id = j.equipo_id WHERE j.id = $1`,
    [jugador_id]
  );
  const jugador = jugadorRows[0];
  if (!jugador) return res.status(404).json({ error: 'Jugador no encontrado' });

  const expulsion = await expulsarJugador(pool, {
    torneoId: jugador.torneo_id, jugadorId: jugador_id, motivo: motivo.trim(), multa, creadoPor: req.usuario.id
  });

  await registrar(pool, {
    torneoId: jugador.torneo_id, usuarioId: req.usuario.id,
    accion: `Expulsó del campeonato a ${jugador.nombre} (${jugador.equipo_nombre}) — Motivo: ${motivo.trim()}. El equipo queda bloqueado hasta pagar la multa de ${multa || 0}.`
  });

  res.status(201).json(expulsion);
}));

// Marca la multa de una expulsión como pagada — libera al EQUIPO para volver a
// jugar (el jugador expulsado sigue vetado para siempre, eso no se revierte).
router.post('/expulsion/:id/pagar', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM jugador_expulsiones WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}), asyncHandler(async (req, res) => {
  if (req.usuario.rol === 'arbitro') {
    return res.status(403).json({ error: 'Solo el organizador o el admin pueden confirmar este pago' });
  }
  const { rows } = await pool.query('SELECT * FROM jugador_expulsiones WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Esa expulsión no existe' });

  await marcarMultaExpulsionPagada(pool, req.params.id, req.usuario.id);
  await registrar(pool, {
    torneoId: rows[0].torneo_id, usuarioId: req.usuario.id,
    accion: `Confirmó el pago de la multa de expulsión (equipo habilitado para volver a jugar)`
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// DISCIPLINA: sanciones de oficio por conductas extradeportivas. Solo
// admin/organizador — ni siquiera el árbitro asignado al torneo puede entrar acá.
// ---------------------------------------------------------------------------

router.get('/disciplina/jugador', requireAuth, requireAccesoTorneo((req) => req.query.torneo_id, ['organizador']), asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  res.json(await calcularDisciplinaJugador(pool, torneo_id));
}));

router.post('/disciplina/jugador', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query(
    `SELECT e.torneo_id FROM jugadores j JOIN equipos e ON e.id = j.equipo_id WHERE j.id = $1`,
    [req.body.jugador_id]
  );
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { jugador_id, motivo, fechas, multa } = req.body;
  if (!jugador_id || !motivo?.trim()) {
    return res.status(400).json({ error: 'jugador_id y motivo son obligatorios' });
  }
  if (!(Number(fechas) > 0) && !(Number(multa) > 0)) {
    return res.status(400).json({ error: 'La sanción debe llevar fechas de suspensión, multa, o ambas' });
  }

  const { rows: jugadorRows } = await pool.query(
    `SELECT j.nombre, e.nombre AS equipo_nombre, e.torneo_id FROM jugadores j JOIN equipos e ON e.id = j.equipo_id WHERE j.id = $1`,
    [jugador_id]
  );
  const jugador = jugadorRows[0];
  if (!jugador) return res.status(404).json({ error: 'Jugador no encontrado' });

  const sancion = await crearDisciplinaJugador(pool, {
    torneoId: jugador.torneo_id, jugadorId: jugador_id, motivo: motivo.trim(),
    fechas: Number(fechas) || 0, multa: Number(multa) || 0, creadoPor: req.usuario.id
  });

  let detalle = `Sanción de disciplina a ${jugador.nombre} (${jugador.equipo_nombre}) — Motivo: ${motivo.trim()}.`;
  if (sancion.fechas > 0) detalle += ` Suspendido ${sancion.fechas} fecha(s).`;
  if (Number(sancion.multa) > 0) detalle += ` Multa de ${sancion.multa} — el equipo queda bloqueado hasta pagarla.`;
  await registrar(pool, { torneoId: jugador.torneo_id, usuarioId: req.usuario.id, accion: detalle });

  res.status(201).json(sancion);
}));

router.post('/disciplina/jugador/:id/pagar', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM disciplina_jugador WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM disciplina_jugador WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Esa sanción no existe' });

  await marcarMultaDisciplinaJugadorPagada(pool, req.params.id, req.usuario.id);
  await registrar(pool, {
    torneoId: rows[0].torneo_id, usuarioId: req.usuario.id,
    accion: `Confirmó el pago de una multa de disciplina (equipo habilitado para volver a jugar)`
  });
  res.json({ ok: true });
}));

router.get('/disciplina/equipo', requireAuth, requireAccesoTorneo((req) => req.query.torneo_id, ['organizador']), asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  res.json(await calcularDisciplinaEquipo(pool, torneo_id));
}));

router.post('/disciplina/equipo', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM equipos WHERE id = $1', [req.body.equipo_id]);
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { equipo_id, motivo, multa } = req.body;
  if (!equipo_id || !motivo?.trim()) {
    return res.status(400).json({ error: 'equipo_id y motivo son obligatorios' });
  }
  if (!(Number(multa) > 0)) {
    return res.status(400).json({ error: 'La multa debe ser mayor a 0' });
  }

  const { rows: equipoRows } = await pool.query('SELECT nombre, torneo_id FROM equipos WHERE id = $1', [equipo_id]);
  const equipo = equipoRows[0];
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' });

  const sancion = await crearDisciplinaEquipo(pool, {
    torneoId: equipo.torneo_id, equipoId: equipo_id, motivo: motivo.trim(), multa: Number(multa), creadoPor: req.usuario.id
  });

  await registrar(pool, {
    torneoId: equipo.torneo_id, usuarioId: req.usuario.id,
    accion: `Sanción económica de disciplina a ${equipo.nombre} — Motivo: ${motivo.trim()}. Multa de ${multa} — el equipo queda bloqueado hasta pagarla.`
  });

  res.status(201).json(sancion);
}));

router.post('/disciplina/equipo/:id/pagar', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM disciplina_equipo WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM disciplina_equipo WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Esa sanción no existe' });

  await marcarMultaDisciplinaEquipoPagada(pool, req.params.id, req.usuario.id);
  await registrar(pool, {
    torneoId: rows[0].torneo_id, usuarioId: req.usuario.id,
    accion: `Confirmó el pago de una multa económica de disciplina (equipo habilitado para volver a jugar)`
  });
  res.json({ ok: true });
}));

module.exports = router;
