const jwt = require('jsonwebtoken');
const pool = require('../db');

// Interruptor general de la plataforma: cuando el admin la apaga, todo /api deja de
// responder (503) salvo para él. Siguen abiertos a propósito:
//  - /api/salud: lo usa el ping que mantiene despierto el servidor.
//  - /api/configuracion: así las pantallas saben si mostrar el aviso de mantenimiento.
//  - /api/auth: para que el admin pueda iniciar sesión y volver a encenderla.
const SIEMPRE_ABIERTAS = ['/api/salud', '/api/configuracion', '/api/auth'];

let cache = { valor: true, hasta: 0 };

async function plataformaDisponible() {
  if (Date.now() < cache.hasta) return cache.valor;
  const { rows } = await pool.query('SELECT plataforma_disponible FROM configuracion_global WHERE id = 1');
  cache = { valor: rows[0]?.plataforma_disponible ?? true, hasta: Date.now() + 5000 };
  return cache.valor;
}

function invalidarCache() {
  cache = { valor: true, hasta: 0 };
}

function esAdmin(req) {
  try {
    const token = req.cookies?.sesion;
    return !!token && jwt.verify(token, process.env.JWT_SECRET).rol === 'admin';
  } catch {
    return false;
  }
}

async function verificarDisponibilidad(req, res, next) {
  if (SIEMPRE_ABIERTAS.some((ruta) => req.originalUrl.startsWith(ruta))) {
    return next();
  }
  try {
    if (await plataformaDisponible() || esAdmin(req)) return next();
  } catch {
    return next(); // si falla la consulta, mejor no tumbar la plataforma
  }
  res.status(503).json({
    error: 'La plataforma está en mantenimiento. Vuelve a intentarlo en unos minutos.',
    mantenimiento: true
  });
}

module.exports = { verificarDisponibilidad, invalidarCache };
