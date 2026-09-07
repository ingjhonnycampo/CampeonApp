const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrar } = require('../bitacora');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.nombre, u.email, u.rol, u.creado_en,
      COALESCE(
        (SELECT json_agg(json_build_object('id', t.id, 'nombre', t.nombre))
         FROM torneo_arbitros ta JOIN torneos t ON t.id = ta.torneo_id
         WHERE ta.usuario_id = u.id),
        '[]'
      ) AS torneos
    FROM usuarios u
    ORDER BY u.creado_en DESC
  `);
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { nombre, email, password, rol, torneo_ids } = req.body;
  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: 'nombre, email, password y rol son obligatorios' });
  }
  if (!['admin', 'arbitro', 'organizador'].includes(rol)) {
    return res.status(400).json({ error: 'rol debe ser admin, organizador o arbitro' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const yaExiste = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  if (yaExiste.rows[0]) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email, rol, creado_en`,
    [nombre, email, password_hash, rol]
  );
  const usuario = rows[0];

  if (['arbitro', 'organizador'].includes(rol) && Array.isArray(torneo_ids)) {
    for (const torneoId of torneo_ids) {
      await pool.query(
        'INSERT INTO torneo_arbitros (torneo_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [torneoId, usuario.id]
      );
    }
  }

  await registrar(pool, { usuarioId: req.usuario.id, accion: `Creó el usuario "${usuario.nombre}" (${usuario.rol})` });

  res.status(201).json(usuario);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { nombre, email, rol, password, torneo_ids } = req.body;
  if (rol && !['admin', 'arbitro', 'organizador'].includes(rol)) {
    return res.status(400).json({ error: 'rol debe ser admin, organizador o arbitro' });
  }

  const actual = (await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id])).rows[0];
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });

  const password_hash = password ? await bcrypt.hash(password, 10) : actual.password_hash;
  if (password && password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const { rows } = await pool.query(
    `UPDATE usuarios SET nombre = $1, email = $2, rol = $3, password_hash = $4
     WHERE id = $5 RETURNING id, nombre, email, rol, creado_en`,
    [nombre ?? actual.nombre, email ?? actual.email, rol ?? actual.rol, password_hash, req.params.id]
  );
  const usuario = rows[0];

  if (Array.isArray(torneo_ids)) {
    await pool.query('DELETE FROM torneo_arbitros WHERE usuario_id = $1', [usuario.id]);
    if (['arbitro', 'organizador'].includes(usuario.rol)) {
      for (const torneoId of torneo_ids) {
        await pool.query(
          'INSERT INTO torneo_arbitros (torneo_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [torneoId, usuario.id]
        );
      }
    }
  }

  await registrar(pool, { usuarioId: req.usuario.id, accion: `Editó el usuario "${usuario.nombre}"` });

  res.json(usuario);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  const { rows } = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });

  await registrar(pool, { usuarioId: req.usuario.id, accion: `Eliminó el usuario "${rows[0].nombre}"` });

  res.json({ ok: true });
}));

module.exports = router;
