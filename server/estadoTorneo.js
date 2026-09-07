// Un campeonato queda "finalizado" cuando de verdad se jugó su último partido: el
// de la final, si hay eliminatoria; o el último partido del fixture/grupos, si no la
// hay. No se basa en fechas — se basa en resultados reales cargados. Devuelve
// tambien la fecha de ese ultimo partido, para poder ordenar los finalizados por
// cuando terminaron de verdad.
async function estadoFinalizacion(pool, torneo) {
  if (!torneo.fixture_generado) return { finalizado: false, fechaFin: null };

  const { rows: fasesElim } = await pool.query(
    "SELECT id FROM fases WHERE torneo_id = $1 AND tipo = 'eliminacion'",
    [torneo.id]
  );
  if (fasesElim[0]) {
    const { rows } = await pool.query(
      `SELECT * FROM partidos WHERE fase_id = $1 AND es_tercer_puesto = false ORDER BY jornada DESC, id DESC LIMIT 1`,
      [fasesElim[0].id]
    );
    const final = rows[0];
    return { finalizado: final?.estado === 'jugado', fechaFin: final?.estado === 'jugado' ? final.creado_en : null };
  }

  const condicionFase = torneo.formato === 'grupos'
    ? `p.fase_id = (SELECT id FROM fases WHERE torneo_id = $1 AND tipo = 'grupos')`
    : `p.torneo_id = $1 AND p.fase_id IS NULL`;

  const { rows: totalRows } = await pool.query(`SELECT count(*) FROM partidos p WHERE ${condicionFase}`, [torneo.id]);
  const { rows: jugadosRows } = await pool.query(
    `SELECT count(*), max(p.creado_en) AS ultima FROM partidos p WHERE ${condicionFase} AND p.estado = 'jugado'`,
    [torneo.id]
  );
  const total = Number(totalRows[0].count);
  const jugados = Number(jugadosRows[0].count);
  const finalizado = total > 0 && total === jugados;
  return { finalizado, fechaFin: finalizado ? jugadosRows[0].ultima : null };
}

// Estado de tres valores para el hub público: 'proximamente' (fixture sin generar,
// o generado pero sin ningún resultado cargado todavía), 'en_curso' (ya se jugó
// algo pero no el/los partido(s) que definen el campeonato) o 'finalizado'.
async function estadoPublicoTorneo(pool, torneo) {
  const { finalizado, fechaFin } = await estadoFinalizacion(pool, torneo);
  if (finalizado) return { estado: 'finalizado', fechaFin };
  if (!torneo.fixture_generado) return { estado: 'proximamente', fechaFin: null };

  const { rows } = await pool.query(
    "SELECT 1 FROM partidos WHERE torneo_id = $1 AND estado = 'jugado' LIMIT 1",
    [torneo.id]
  );
  return { estado: rows[0] ? 'en_curso' : 'proximamente', fechaFin: null };
}

module.exports = { estadoFinalizacion, estadoPublicoTorneo };
