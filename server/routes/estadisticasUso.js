const express = require('express');
const pool = require('../db');
const asyncHandler = require('../asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ETIQUETA_RUTA = {
  inicio: 'Pantalla de bienvenida',
  en_vivo: 'Ver en vivo (listado general)',
  campeonato: 'Un campeonato puntual',
  partido: 'Un partido puntual',
  inscripcion: 'Formulario de inscripción'
};

// Solo el admin ve esto — es un conteo de toda la plataforma, no de un
// campeonato en particular.
router.get('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows: totalRows } = await pool.query('SELECT count(*) FROM visitas');
  const { rows: dias7 } = await pool.query(`SELECT count(*) FROM visitas WHERE creado_en >= now() - interval '7 days'`);
  const { rows: dias30 } = await pool.query(`SELECT count(*) FROM visitas WHERE creado_en >= now() - interval '30 days'`);

  const { rows: porDia } = await pool.query(`
    SELECT date_trunc('day', creado_en)::date AS fecha, count(*) AS cantidad
    FROM visitas
    WHERE creado_en >= now() - interval '30 days'
    GROUP BY fecha
    ORDER BY fecha
  `);

  const { rows: porRutaRaw } = await pool.query(`
    SELECT ruta, count(*) AS cantidad FROM visitas GROUP BY ruta ORDER BY cantidad DESC
  `);

  const { rows: porCampeonato } = await pool.query(`
    SELECT v.torneo_id, t.nombre AS torneo_nombre, count(*) AS cantidad
    FROM visitas v
    JOIN torneos t ON t.id = v.torneo_id
    GROUP BY v.torneo_id, t.nombre
    ORDER BY cantidad DESC
    LIMIT 10
  `);

  res.json({
    total: Number(totalRows[0].count),
    ultimos7dias: Number(dias7[0].count),
    ultimos30dias: Number(dias30[0].count),
    porDia: porDia.map((r) => ({ fecha: r.fecha, cantidad: Number(r.cantidad) })),
    porRuta: porRutaRaw.map((r) => ({ ruta: r.ruta, etiqueta: ETIQUETA_RUTA[r.ruta] || r.ruta, cantidad: Number(r.cantidad) })),
    porCampeonato: porCampeonato.map((r) => ({ torneoId: r.torneo_id, torneoNombre: r.torneo_nombre, cantidad: Number(r.cantidad) }))
  });
}));

module.exports = router;
