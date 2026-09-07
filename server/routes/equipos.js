const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireAccesoTorneo } = require('../middleware/auth');
const { registrar } = require('../bitacora');
const { aplicarBajaEquipo } = require('../bajas');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  if (!torneo_id) return res.status(400).json({ error: 'torneo_id es obligatorio' });
  const { rows } = await pool.query(
    'SELECT * FROM equipos WHERE torneo_id = $1 ORDER BY nombre',
    [torneo_id]
  );
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM equipos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(rows[0]);
}));

router.post('/', requireAuth, requireAccesoTorneo((req) => req.body.torneo_id, ['organizador']), asyncHandler(async (req, res) => {
  const { torneo_id, nombre, escudo_url, delegado } = req.body;
  if (!torneo_id || !nombre) {
    return res.status(400).json({ error: 'torneo_id y nombre son obligatorios' });
  }
  const { rows } = await pool.query(
    `INSERT INTO equipos (torneo_id, nombre, escudo_url, delegado)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [torneo_id, nombre, escudo_url || null, delegado || null]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM equipos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { estado } = req.body;
  if (!['pendiente', 'aprobado', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'estado inválido' });
  }
  const { rows } = await pool.query(
    'UPDATE equipos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });

  const verbo = { aprobado: 'Aprobó', rechazado: 'Rechazó', pendiente: 'Puso en pendiente' }[estado];
  await registrar(pool, {
    torneoId: rows[0].torneo_id, usuarioId: req.usuario.id,
    accion: `${verbo} el equipo "${rows[0].nombre}"`
  });

  res.json(rows[0]);
}));

// Retira o descalifica un equipo del torneo (no de la inscripción — eso es
// "estado"). Resuelve automáticamente por walkover (3-0) sus partidos de
// liga/grupos pendientes; los de la fase eliminatoria hay que revisarlos a mano.
router.patch('/:id/baja', requireAuth, requireAccesoTorneo(async (req) => {
  const { rows } = await pool.query('SELECT torneo_id FROM equipos WHERE id = $1', [req.params.id]);
  return rows[0]?.torneo_id;
}, ['organizador']), asyncHandler(async (req, res) => {
  const { tipo, motivo } = req.body;
  if (!['retirado', 'descalificado'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser retirado o descalificado' });
  }
  if (!motivo?.trim()) {
    return res.status(400).json({ error: 'Indica el motivo' });
  }

  const resultado = await aplicarBajaEquipo(pool, req.params.id, tipo, motivo.trim(), req.usuario.id);
  if (!resultado.ok) return res.status(400).json({ error: resultado.error });

  res.json(resultado);
}));

module.exports = router;
