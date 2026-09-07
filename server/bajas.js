const { registrar } = require('./bitacora');

// Marca un equipo como retirado o descalificado, y resuelve automáticamente por
// walkover (3-0 a favor del rival) todos sus partidos de LIGA o GRUPOS que
// todavía no se hayan jugado. Los que ya se jugaron quedan tal cual (su
// resultado real le sigue contando al rival). Si el equipo tiene partidos
// pendientes en la fase ELIMINATORIA, esos NO se tocan — avanzar en un cuadro
// eliminatorio es una operación más delicada y se deja para revisar a mano.
async function aplicarBajaEquipo(pool, equipoIdCrudo, tipo, motivo, usuarioId) {
  // equipoIdCrudo puede llegar como string (ej. req.params.id) — se normaliza a
  // numero aqui mismo para que las comparaciones con equipo_local_id/visitante_id
  // (que la libreria pg siempre devuelve como numero) no fallen en silencio.
  const equipoId = Number(equipoIdCrudo);
  const { rows } = await pool.query('SELECT * FROM equipos WHERE id = $1', [equipoId]);
  const equipo = rows[0];
  if (!equipo) return { ok: false, error: 'Equipo no encontrado' };
  if (equipo.estado_torneo !== 'activo') return { ok: false, error: 'Este equipo ya estaba de baja' };

  await pool.query(
    `UPDATE equipos SET estado_torneo = $1, baja_motivo = $2, baja_fecha = now() WHERE id = $3`,
    [tipo, motivo, equipoId]
  );

  const { rows: pendientesLigaGrupos } = await pool.query(
    `SELECT * FROM partidos
     WHERE torneo_id = $1 AND estado != 'jugado'
       AND (equipo_local_id = $2 OR equipo_visitante_id = $2)
       AND (fase_id IS NULL OR fase_id IN (SELECT id FROM fases WHERE torneo_id = $1 AND tipo = 'grupos'))`,
    [equipo.torneo_id, equipoId]
  );
  for (const p of pendientesLigaGrupos) {
    const ausenteEsLocal = p.equipo_local_id === equipoId;
    await pool.query(
      `UPDATE partidos SET goles_local = $1, goles_visitante = $2, estado = 'jugado', es_walkover = true, walkover_ausente_id = $3
       WHERE id = $4`,
      [ausenteEsLocal ? 0 : 3, ausenteEsLocal ? 3 : 0, equipoId, p.id]
    );
  }

  const { rows: pendientesElim } = await pool.query(
    `SELECT count(*) FROM partidos
     WHERE torneo_id = $1 AND estado != 'jugado'
       AND (equipo_local_id = $2 OR equipo_visitante_id = $2)
       AND fase_id IN (SELECT id FROM fases WHERE torneo_id = $1 AND tipo = 'eliminacion')`,
    [equipo.torneo_id, equipoId]
  );
  const pendientesElimCount = Number(pendientesElim[0].count);

  const verbo = tipo === 'descalificado' ? 'Descalificó' : 'Retiró';
  let accion = `${verbo} a ${equipo.nombre} — Motivo: ${motivo}.`;
  if (pendientesLigaGrupos.length > 0) {
    accion += ` Se le dieron por perdidos ${pendientesLigaGrupos.length} partido(s) pendiente(s) de liga/grupos (walkover 3-0 a favor del rival).`;
  }
  if (pendientesElimCount > 0) {
    accion += ` Ojo: tiene ${pendientesElimCount} partido(s) pendiente(s) en la fase eliminatoria que hay que revisar a mano.`;
  }
  await registrar(pool, { torneoId: equipo.torneo_id, usuarioId, accion });

  return {
    ok: true,
    walkoversAplicados: pendientesLigaGrupos.length,
    pendientesEliminatoria: pendientesElimCount
  };
}

module.exports = { aplicarBajaEquipo };
