const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrar } = require('../bitacora');
const { invalidarCache } = require('../middleware/mantenimiento');

const router = express.Router();

// Pública (sin login): la usan tanto el panel de admin como las páginas
// públicas para saber si deben mostrar algo relacionado con transmisión en vivo.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT transmision_habilitada, plataforma_disponible FROM configuracion_global WHERE id = 1');
  res.json({
    transmisionHabilitada: rows[0]?.transmision_habilitada ?? false,
    plataformaDisponible: rows[0]?.plataforma_disponible ?? true
  });
}));

// Solo el admin (dueño de la plataforma) puede prender/apagar esto — afecta a
// TODOS los campeonatos a la vez, no es algo que decida un organizador puntual.
router.patch('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { transmision_habilitada } = req.body;
  if (typeof transmision_habilitada !== 'boolean') {
    return res.status(400).json({ error: 'transmision_habilitada debe ser true o false' });
  }

  await pool.query('UPDATE configuracion_global SET transmision_habilitada = $1 WHERE id = 1', [transmision_habilitada]);
  await registrar(pool, {
    torneoId: null, usuarioId: req.usuario.id,
    accion: `${transmision_habilitada ? 'Activó' : 'Desactivó'} la transmisión en vivo para toda la plataforma`
  });

  res.json({ transmisionHabilitada: transmision_habilitada });
}));

// Interruptor general (modo mantenimiento): apagado, solo el admin puede usar la
// plataforma; el público y los demás usuarios ven el aviso de mantenimiento.
router.patch('/disponibilidad', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { plataforma_disponible } = req.body;
  if (typeof plataforma_disponible !== 'boolean') {
    return res.status(400).json({ error: 'plataforma_disponible debe ser true o false' });
  }

  await pool.query('UPDATE configuracion_global SET plataforma_disponible = $1 WHERE id = 1', [plataforma_disponible]);
  invalidarCache();
  await registrar(pool, {
    torneoId: null, usuarioId: req.usuario.id,
    accion: `${plataforma_disponible ? 'Encendió' : 'Apagó'} la plataforma para todos los usuarios y el público`
  });

  res.json({ plataformaDisponible: plataforma_disponible });
}));

module.exports = router;
