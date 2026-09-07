const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// En desarrollo, frontend y backend comparten origen (vía el proxy de Vite), así
// que "lax" alcanza. En producción, si viven en dominios distintos (ej. Vercel +
// Render), el navegador exige "none" + secure para mandar la cookie entre sitios.
const enProduccion = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: enProduccion ? 'none' : 'lax',
  secure: enProduccion,
  maxAge: 12 * 60 * 60 * 1000
};

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios' });
  }

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  const token = jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, equipo_id: usuario.equipo_id },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.cookie('sesion', token, COOKIE_OPTS);
  res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('sesion', COOKIE_OPTS);
  res.json({ ok: true });
});

router.get('/yo', requireAuth, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;
