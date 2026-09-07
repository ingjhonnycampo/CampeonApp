const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');

async function obtenerTorneoIdDeEquipo(equipoId) {
  const { rows } = await pool.query('SELECT torneo_id FROM equipos WHERE id = $1', [equipoId]);
  return rows[0]?.torneo_id;
}

async function obtenerTorneoIdDeJugador(jugadorId) {
  const { rows } = await pool.query(
    'SELECT e.torneo_id FROM jugadores j JOIN equipos e ON e.id = j.equipo_id WHERE j.id = $1',
    [jugadorId]
  );
  return rows[0]?.torneo_id;
}
const { registrar } = require('../bitacora');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { equipo_id } = req.query;
  if (!equipo_id) return res.status(400).json({ error: 'equipo_id es obligatorio' });
  const { rows } = await pool.query(
    'SELECT * FROM jugadores WHERE equipo_id = $1 ORDER BY numero_camiseta NULLS LAST, nombre',
    [equipo_id]
  );
  res.json(rows);
}));

router.post('/', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeEquipo(req.body.equipo_id), ['organizador']), asyncHandler(async (req, res) => {
  const { equipo_id, nombre, cedula, fecha_nacimiento, numero_camiseta, foto_url } = req.body;
  if (!equipo_id || !nombre) {
    return res.status(400).json({ error: 'equipo_id y nombre son obligatorios' });
  }
  const { rows } = await pool.query(
    `INSERT INTO jugadores (equipo_id, nombre, cedula, fecha_nacimiento, numero_camiseta, foto_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [equipo_id, nombre, cedula || null, fecha_nacimiento || null, numero_camiseta || null, foto_url || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeJugador(req.params.id), ['organizador']), asyncHandler(async (req, res) => {
  const { estado_validacion, nombre, cedula, fecha_nacimiento, numero_camiseta } = req.body;

  if (estado_validacion !== undefined && !['pendiente', 'validado', 'rechazado'].includes(estado_validacion)) {
    return res.status(400).json({ error: 'estado_validacion inválido' });
  }

  const actual = (await pool.query('SELECT * FROM jugadores WHERE id = $1', [req.params.id])).rows[0];
  if (!actual) return res.status(404).json({ error: 'Jugador no encontrado' });

  const { rows } = await pool.query(
    `UPDATE jugadores SET
       nombre = $1, cedula = $2, fecha_nacimiento = $3, numero_camiseta = $4, estado_validacion = $5
     WHERE id = $6 RETURNING *`,
    [
      nombre ?? actual.nombre,
      cedula !== undefined ? cedula : actual.cedula,
      fecha_nacimiento !== undefined ? fecha_nacimiento : actual.fecha_nacimiento,
      numero_camiseta !== undefined ? numero_camiseta : actual.numero_camiseta,
      estado_validacion ?? actual.estado_validacion,
      req.params.id
    ]
  );
  const jugador = rows[0];

  // Si la edad de un jugador queda rechazada, la planilla del equipo se reabre para que el
  // delegado la corrija con su código, en vez de quedar "aprobada" con un dato sin resolver.
  if (estado_validacion === 'rechazado') {
    await pool.query(
      `UPDATE equipos SET estado = 'rechazado',
         motivo_rechazo = $1
       WHERE id = $2`,
      [`No se pudo validar la edad de ${jugador.nombre}. Revisa y corrige su fecha de nacimiento.`, jugador.equipo_id]
    );
  }

  if (estado_validacion && estado_validacion !== actual.estado_validacion) {
    const { rows: equipoRows } = await pool.query('SELECT torneo_id FROM equipos WHERE id = $1', [jugador.equipo_id]);
    const verbo = { validado: 'Validó', rechazado: 'Rechazó', pendiente: 'Puso en pendiente' }[estado_validacion];
    await registrar(pool, {
      torneoId: equipoRows[0]?.torneo_id, usuarioId: req.usuario.id,
      accion: `${verbo} la edad del jugador "${jugador.nombre}"`
    });
  }

  res.json(jugador);
}));

router.delete('/:id', requireAuth, requireAccesoTorneo((req) => obtenerTorneoIdDeJugador(req.params.id), ['organizador']), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM jugadores WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Jugador no encontrado' });
  res.json({ ok: true });
}));

module.exports = router;
