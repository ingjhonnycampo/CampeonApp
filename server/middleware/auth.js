const jwt = require('jsonwebtoken');
const pool = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.sesion;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

// El admin (dueño de la plataforma) siempre pasa. Un árbitro o un organizador solo
// pasan si fueron asignados a ese campeonato específico en torneo_arbitros (misma
// tabla para los dos roles). obtenerTorneoId(req) debe devolver el id del torneo
// relevante para la ruta (desde params o body). rolesPermitidos deja elegir, por
// ruta, si además de admin se permite 'arbitro', 'organizador', o ambos (por
// defecto ambos) — por ejemplo, aprobar equipos o configurar el fixture es cosa
// de organizador (como si fuera admin de ese campeonato), no de árbitro.
function requireAccesoTorneo(obtenerTorneoId, rolesPermitidos = ['arbitro', 'organizador']) {
  return async (req, res, next) => {
    if (req.usuario.rol === 'admin') return next();

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }

    const torneoId = await obtenerTorneoId(req);
    if (!torneoId) return res.status(400).json({ error: 'No se pudo determinar el campeonato' });

    const { rows } = await pool.query(
      'SELECT 1 FROM torneo_arbitros WHERE torneo_id = $1 AND usuario_id = $2',
      [torneoId, req.usuario.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'No estás asignado a este campeonato' });

    next();
  };
}

module.exports = { requireAuth, requireRole, requireAccesoTorneo };
