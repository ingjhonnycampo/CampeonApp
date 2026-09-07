const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { torneo_id } = req.query;
  const params = [];
  let where = '';
  if (torneo_id) {
    params.push(torneo_id);
    where = 'WHERE b.torneo_id = $1';
  }

  const { rows } = await pool.query(
    `SELECT b.*, u.nombre AS usuario_nombre, t.nombre AS torneo_nombre
     FROM bitacora b
     LEFT JOIN usuarios u ON u.id = b.usuario_id
     LEFT JOIN torneos t ON t.id = b.torneo_id
     ${where}
     ORDER BY b.creado_en DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
}));

module.exports = router;
