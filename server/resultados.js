const { obtenerGanadorId, obtenerPerdedorId } = require('./fixture');
const { intentarLlenarPrimeraRonda } = require('./clasificacion');
const { registrar } = require('./bitacora');

// Guarda el marcador final de un partido (goles_local/goles_visitante), lo marca
// 'jugado', y hace todo lo que depende de eso: exige motivo si es una corrección,
// pide penales si quedó empatado en eliminatoria, deja la bitácora, propaga el
// ganador/perdedor a las casillas de la ronda siguiente si es de eliminatoria, y
// recalcula/llena la primera ronda de la eliminatoria si este resultado era de la
// fase previa (fixture principal o fase de grupos). La usan tanto el PATCH manual
// de un partido como el botón "Finalizar partido" de la planilla en vivo — así la
// lógica de cierre queda en un solo lugar sin importar de dónde salga el marcador.
async function guardarResultadoFinal(pool, { partidoId, golesLocal, golesVisitante, penalesLocal, penalesVisitante, motivo, usuarioId }) {
  if (golesLocal === undefined || golesLocal === null || golesVisitante === undefined || golesVisitante === null) {
    return { status: 400, error: 'goles_local y goles_visitante son obligatorios' };
  }
  if (golesLocal < 0 || golesVisitante < 0) {
    return { status: 400, error: 'El marcador no puede ser negativo' };
  }

  const { rows: actuales } = await pool.query('SELECT * FROM partidos WHERE id = $1', [partidoId]);
  const actual = actuales[0];
  if (!actual) return { status: 404, error: 'Partido no encontrado' };
  if (!actual.equipo_local_id || !actual.equipo_visitante_id) {
    return { status: 400, error: 'Todavía no se sabe qué equipos juegan este partido' };
  }

  const esCorreccion = actual.estado === 'jugado';
  if (esCorreccion && !motivo?.trim()) {
    return { status: 400, error: 'Este partido ya tenía un resultado cargado: indica el motivo de la corrección' };
  }

  // La definición por penales solo tiene sentido en un partido de eliminatoria y
  // cuando de verdad quedó empatado. Si la llave es a ida y vuelta, lo que importa
  // es el marcador GLOBAL de las dos piernas (no el de este partido solo) — por
  // eso, si ya se jugó la otra pierna, el empate se evalúa sobre el agregado.
  let ganadorFinal = null;
  let penalesLocalFinal = null;
  let penalesVisitanteFinal = null;
  if (actual.fase_id) {
    const esVuelta = !!actual.partido_ida_id;
    const hermano = esVuelta
      ? (await pool.query('SELECT * FROM partidos WHERE id = $1', [actual.partido_ida_id])).rows[0]
      : (await pool.query('SELECT * FROM partidos WHERE partido_ida_id = $1', [actual.id])).rows[0] || null;

    let empatado;
    if (!hermano || hermano.estado !== 'jugado') {
      empatado = golesLocal === golesVisitante;
    } else {
      const idaGolesLocal = esVuelta ? hermano.goles_local : golesLocal;
      const idaGolesVisitante = esVuelta ? hermano.goles_visitante : golesVisitante;
      const vueltaGolesLocal = esVuelta ? golesLocal : hermano.goles_local;
      const vueltaGolesVisitante = esVuelta ? golesVisitante : hermano.goles_visitante;
      empatado = (idaGolesLocal + vueltaGolesVisitante) === (idaGolesVisitante + vueltaGolesLocal);
    }

    if (empatado) {
      if (penalesLocal === undefined || penalesLocal === null || penalesVisitante === undefined || penalesVisitante === null) {
        return { status: 400, error: 'El resultado quedó empatado: indica el marcador de los penales' };
      }
      if (!Number.isInteger(penalesLocal) || !Number.isInteger(penalesVisitante) || penalesLocal < 0 || penalesVisitante < 0) {
        return { status: 400, error: 'El marcador de penales debe ser un número entero positivo' };
      }
      if (penalesLocal === penalesVisitante) {
        return { status: 400, error: 'Los penales no pueden quedar empatados' };
      }
      ganadorFinal = penalesLocal > penalesVisitante ? actual.equipo_local_id : actual.equipo_visitante_id;
      penalesLocalFinal = penalesLocal;
      penalesVisitanteFinal = penalesVisitante;
    }
  }

  const { rows } = await pool.query(
    `UPDATE partidos SET goles_local = $1, goles_visitante = $2, estado = 'jugado', ganador_id = $3, penales_local = $4, penales_visitante = $5,
            jugado_hasta = COALESCE(jugado_hasta, now())
     WHERE id = $6 RETURNING *`,
    [golesLocal, golesVisitante, ganadorFinal, penalesLocalFinal, penalesVisitanteFinal, partidoId]
  );
  const partido = rows[0];

  const { rows: nombresRows } = await pool.query(
    'SELECT el.nombre AS local, ev.nombre AS visitante FROM equipos el, equipos ev WHERE el.id = $1 AND ev.id = $2',
    [partido.equipo_local_id, partido.equipo_visitante_id]
  );
  const nombres = nombresRows[0] || {};

  if (esCorreccion) {
    await pool.query(
      `INSERT INTO partido_ediciones (partido_id, goles_local_anterior, goles_visitante_anterior, goles_local_nuevo, goles_visitante_nuevo, motivo, editado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [partido.id, actual.goles_local, actual.goles_visitante, golesLocal, golesVisitante, motivo.trim(), usuarioId]
    );
    await registrar(pool, {
      torneoId: partido.torneo_id, usuarioId,
      accion: `Corrigió el resultado de ${nombres.local} ${actual.goles_local}-${actual.goles_visitante} ${nombres.visitante} a ${golesLocal}-${golesVisitante} — Motivo: ${motivo.trim()}`
    });
  } else {
    await registrar(pool, {
      torneoId: partido.torneo_id, usuarioId,
      accion: `Cargó el resultado ${nombres.local} ${golesLocal}-${golesVisitante} ${nombres.visitante}`
    });
  }

  // Si este resultado decide una llave del cuadro de eliminatoria, completa (o
  // corrige) las casillas que dependen de ella con el ganador — o el perdedor, si
  // el destino es el partido por el 3er puesto. Nunca toca una casilla cuyo
  // partido ya se jugó. Los dependientes siempre se referencian por la "ida" de la
  // llave — si lo que se acaba de guardar es una vuelta, la llave a resolver es la
  // de su ida.
  const idaDeLlave = partido.partido_ida_id
    ? (await pool.query('SELECT * FROM partidos WHERE id = $1', [partido.partido_ida_id])).rows[0]
    : partido;

  const { rows: dependientes } = await pool.query(
    'SELECT * FROM partidos WHERE (origen_local_id = $1 OR origen_visitante_id = $1) AND partido_ida_id IS NULL',
    [idaDeLlave.id]
  );
  if (dependientes.length > 0 && idaDeLlave.estado === 'jugado') {
    const { rows: vueltaRows } = await pool.query('SELECT * FROM partidos WHERE partido_ida_id = $1', [idaDeLlave.id]);
    const vueltaDeLlave = vueltaRows[0] || null;
    if (!vueltaDeLlave || vueltaDeLlave.estado === 'jugado') {
      for (const dep of dependientes) {
        if (dep.estado === 'jugado') continue;
        const valor = dep.es_tercer_puesto ? obtenerPerdedorId(idaDeLlave, vueltaDeLlave) : obtenerGanadorId(idaDeLlave, vueltaDeLlave);
        if (!valor) continue;
        const campo = dep.origen_local_id === idaDeLlave.id ? 'equipo_local_id' : 'equipo_visitante_id';
        const { rows: depRows } = await pool.query(`UPDATE partidos SET ${campo} = $1 WHERE id = $2 RETURNING *`, [valor, dep.id]);
        const depActualizado = depRows[0];
        await pool.query(
          'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2 WHERE partido_ida_id = $3',
          [depActualizado.equipo_visitante_id, depActualizado.equipo_local_id, dep.id]
        );
      }
    }
  }

  // Si este partido era de la fase previa (el fixture principal, o una fase de
  // grupos), recalcula y llena (o corrige) la primera ronda de la eliminatoria que
  // depende de ella — mientras esa ronda todavía no se haya jugado. Si ya se jugó
  // y esto cambiaría quién clasifica, avisa en vez de fallar en silencio.
  let avisoClasificacion = null;
  if (!partido.fase_id) {
    avisoClasificacion = (await intentarLlenarPrimeraRonda(pool, partido.torneo_id, null))?.advertencia || null;
  } else {
    const { rows: faseDelPartido } = await pool.query('SELECT tipo FROM fases WHERE id = $1', [partido.fase_id]);
    if (faseDelPartido[0]?.tipo === 'grupos') {
      avisoClasificacion = (await intentarLlenarPrimeraRonda(pool, partido.torneo_id, partido.fase_id))?.advertencia || null;
    }
  }

  if (avisoClasificacion) {
    await registrar(pool, {
      torneoId: partido.torneo_id, usuarioId,
      accion: `Alerta de clasificación tras el resultado ${nombres.local} ${golesLocal}-${golesVisitante} ${nombres.visitante}: ${avisoClasificacion}`
    });
  }

  return { partido, avisoClasificacion };
}

module.exports = { guardarResultadoFinal };
