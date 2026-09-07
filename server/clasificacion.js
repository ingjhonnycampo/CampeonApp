const {
  calcularPosiciones, intercalarClasificadosPorGrupo, obtenerMejoresTerceros, barajar
} = require('./fixture');

async function obtenerSorteos(pool, torneoId, grupoId) {
  const { rows } = await pool.query(
    `SELECT id, equipos_ids, orden_resultado, delegados_presentes, creado_en
     FROM sorteos_desempate WHERE torneo_id = $1 AND grupo_id IS NOT DISTINCT FROM $2`,
    [torneoId, grupoId]
  );
  return rows;
}

// Calcula la lista ORDENADA (ya sembrada, lista para armarCrucesIniciales) de ids de
// equipos clasificados de una fase de tipo 'grupos': primero los directos
// (intercalados por posición entre grupos), luego los mejores terceros si aplica.
// Si alguno de los puestos que definen quién clasifica sigue empatado a la espera
// de un sorteo, pendienteSorteo sale en true y "clasificados" no se debe usar
// todavía (el orden ahí es solo el alfabetico provisional).
async function calcularClasificadosDeGrupos(pool, faseGrupos) {
  const { rows: grupos } = await pool.query('SELECT * FROM grupos WHERE fase_id = $1 ORDER BY nombre', [faseGrupos.id]);
  const { rows: partidos } = await pool.query('SELECT * FROM partidos WHERE fase_id = $1', [faseGrupos.id]);

  const tablasCompletas = [];
  for (const grupo of grupos) {
    const { rows: equipos } = await pool.query(
      `SELECT e.id, e.nombre, e.escudo_url, e.estado_torneo, e.baja_motivo FROM grupo_equipos ge JOIN equipos e ON e.id = ge.equipo_id WHERE ge.grupo_id = $1`,
      [grupo.id]
    );
    const sorteos = await obtenerSorteos(pool, faseGrupos.torneo_id, grupo.id);
    const partidosGrupo = partidos.filter((p) => p.grupo_id === grupo.id || p.es_intergrupo);
    tablasCompletas.push(calcularPosiciones(equipos, partidosGrupo, sorteos));
  }

  const directos = intercalarClasificadosPorGrupo(tablasCompletas.map((t) => t.slice(0, faseGrupos.clasifican)), faseGrupos.clasifican);
  let terceros = [];
  if (faseGrupos.mejores_terceros > 0) {
    terceros = obtenerMejoresTerceros(tablasCompletas, faseGrupos.clasifican, faseGrupos.mejores_terceros).map((f) => f.equipo_id);
  }

  const posicionesRelevantes = tablasCompletas.flatMap((t) => t.slice(0, faseGrupos.clasifican + faseGrupos.mejores_terceros));
  return {
    clasificados: [...directos, ...terceros],
    pendienteSorteo: posicionesRelevantes.some((f) => f.requiere_sorteo)
  };
}

// Misma idea pero para cuando los clasificados salen directo del fixture principal
// del campeonato (liga simple, sin fase).
async function calcularClasificadosDeFixture(pool, torneoId, cantidad) {
  const { rows: equipos } = await pool.query(
    "SELECT id, nombre, escudo_url, estado_torneo, baja_motivo FROM equipos WHERE torneo_id = $1 AND estado = 'aprobado'",
    [torneoId]
  );
  const { rows: partidos } = await pool.query('SELECT * FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL', [torneoId]);
  const sorteos = await obtenerSorteos(pool, torneoId, null);
  const tabla = calcularPosiciones(equipos, partidos, sorteos);
  const relevantes = tabla.slice(0, cantidad);
  return {
    clasificados: relevantes.map((f) => f.equipo_id),
    pendienteSorteo: relevantes.some((f) => f.requiere_sorteo)
  };
}

// Crea el cuadro COMPLETO de una fase de eliminatoria de una sola vez: la primera
// ronda con "totalClasificados" casillas todavía sin equipo (se llenan después, con
// llenarPrimeraRonda, cuando se sepa quién clasificó), y las rondas siguientes
// (incluido el partido por el 3er puesto) encadenadas via origen_local_id/
// origen_visitante_id para que se completen solas a medida que hay resultados.
//
// Si fase.elim_ida_vuelta es true, cada llave (menos la FINAL y el partido por el
// 3er puesto, que siempre son a partido único) se juega dos veces: la "ida" es la
// que queda enlazada hacia la ronda siguiente via origen_local_id/origen_visitante_id
// (como si fuera la única), y junto a ella se crea una "vuelta" (partido_ida_id
// apuntando a la ida) cuyos equipos siempre quedan sincronizados con los de la ida
// pero invertidos — nunca se resuelve por separado, solo sirve para sumar el
// marcador global de la llave (ver obtenerGanadorId/obtenerPerdedorId en fixture.js).
async function crearEsqueletoCompleto(pool, fase, totalClasificados) {
  const idaVuelta = !!fase.elim_ida_vuelta;
  const esUnicaLlaveTotal = totalClasificados === 2; // ronda 1 ya es la final: siempre partido unico

  let jornada = 1;
  let rondaActual = [];
  for (let i = 0; i < totalClasificados / 2; i++) {
    // Orden de semillas por defecto: puesto i contra puesto (total-1-i) (el mejor
    // ubicado contra el peor ubicado que clasificó). Se puede reordenar despues,
    // antes de que se sepa quien ocupa cada puesto, con PUT /fases/:id/orden-semillas.
    const { rows } = await pool.query(
      `INSERT INTO partidos (torneo_id, fase_id, jornada, orden_semilla_local, orden_semilla_visitante) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [fase.torneo_id, fase.id, jornada, i, totalClasificados - 1 - i]
    );
    const ida = rows[0];
    rondaActual.push(ida);
    if (idaVuelta && !esUnicaLlaveTotal) {
      await pool.query(
        `INSERT INTO partidos (torneo_id, fase_id, jornada, partido_ida_id) VALUES ($1, $2, $3, $4)`,
        [fase.torneo_id, fase.id, jornada, ida.id]
      );
    }
  }
  let generados = rondaActual.length * (idaVuelta && !esUnicaLlaveTotal ? 2 : 1);

  while (rondaActual.length > 1) {
    jornada++;
    const esRondaFinal = rondaActual.length === 2; // esta ronda produce 1 partido: la final, siempre unica
    const siguienteRonda = [];
    for (let i = 0; i < rondaActual.length; i += 2) {
      const { rows } = await pool.query(
        `INSERT INTO partidos (torneo_id, fase_id, jornada, origen_local_id, origen_visitante_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [fase.torneo_id, fase.id, jornada, rondaActual[i].id, rondaActual[i + 1].id]
      );
      const ida = rows[0];
      siguienteRonda.push(ida);
      generados++;
      if (idaVuelta && !esRondaFinal) {
        await pool.query(
          `INSERT INTO partidos (torneo_id, fase_id, jornada, partido_ida_id) VALUES ($1, $2, $3, $4)`,
          [fase.torneo_id, fase.id, jornada, ida.id]
        );
        generados++;
      }
    }
    if (fase.jugar_tercer_puesto && rondaActual.length === 2) {
      // El partido por el 3er puesto siempre es a partido único, sin importar elim_ida_vuelta.
      await pool.query(
        `INSERT INTO partidos (torneo_id, fase_id, jornada, origen_local_id, origen_visitante_id, es_tercer_puesto) VALUES ($1, $2, $3, $4, $5, true)`,
        [fase.torneo_id, fase.id, jornada, rondaActual[0].id, rondaActual[1].id]
      );
      generados++;
    }
    rondaActual = siguienteRonda;
  }

  return generados;
}

// Se llama cada vez que se guarda un resultado. Si ese partido era de la fase previa
// (el fixture principal, o una fase de grupos) y con este resultado esa fase ya
// terminó de jugarse por completo, calcula los clasificados y llena automáticamente
// la primera ronda (todavía "por definir") de la fase de eliminatoria que depende de
// ella — sin que el admin tenga que darle a ningún botón.
async function intentarLlenarPrimeraRonda(pool, torneoId, faseOrigenId) {
  let faseElim;
  let clasificadosInfo;

  if (faseOrigenId) {
    const { rows: origenRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [faseOrigenId]);
    const origen = origenRows[0];
    if (!origen || origen.tipo !== 'grupos') return;

    const { rows: elimRows } = await pool.query('SELECT * FROM fases WHERE fase_origen_id = $1', [faseOrigenId]);
    faseElim = elimRows[0];
    if (!faseElim) return;

    const { rows: pendientes } = await pool.query(
      "SELECT 1 FROM partidos WHERE fase_id = $1 AND estado != 'jugado' LIMIT 1",
      [faseOrigenId]
    );
    if (pendientes[0]) return;

    clasificadosInfo = await calcularClasificadosDeGrupos(pool, origen);
  } else {
    const { rows: elimRows } = await pool.query(
      'SELECT * FROM fases WHERE torneo_id = $1 AND clasifican_de_fixture = true',
      [torneoId]
    );
    faseElim = elimRows[0];
    if (!faseElim) return;

    const { rows: pendientes } = await pool.query(
      "SELECT 1 FROM partidos WHERE torneo_id = $1 AND fase_id IS NULL AND estado != 'jugado' LIMIT 1",
      [torneoId]
    );
    if (pendientes[0]) return;

    clasificadosInfo = await calcularClasificadosDeFixture(pool, torneoId, faseElim.clasifican);
  }

  // Si el puesto que define quien clasifica sigue empatado esperando un sorteo, no
  // se puede armar el cuadro todavia (el orden alfabetico ahi es solo provisional).
  if (clasificadosInfo.pendienteSorteo) {
    return {
      recalculado: false,
      advertencia: 'Hay un empate que necesita sorteo para definir quién clasifica a la fase eliminatoria. Resuélvelo desde la tabla de posiciones y el cuadro se completará solo.'
    };
  }
  const clasificadosIds = clasificadosInfo.clasificados;

  const { rows: ronda1 } = await pool.query(
    'SELECT * FROM partidos WHERE fase_id = $1 AND jornada = 1 AND partido_ida_id IS NULL ORDER BY id',
    [faseElim.id]
  );
  if (ronda1.length === 0) return { recalculado: false }; // sin esqueleto todavía

  const { rows: ronda1Todas } = await pool.query(
    'SELECT estado FROM partidos WHERE fase_id = $1 AND jornada = 1',
    [faseElim.id]
  );
  if (ronda1Todas.some((p) => p.estado === 'jugado')) {
    // Ya se jugó con la clasificación anterior: nunca se pisa un resultado jugado.
    // Pero si lo que se acaba de guardar cambiaría quién clasifica, hay que avisar
    // en vez de quedarse callado — si no, el cuadro queda con equipos que ya no
    // corresponden y nadie se entera hasta que alguien lo nota a mano.
    const actuales = new Set();
    ronda1.forEach((p) => {
      if (p.equipo_local_id) actuales.add(p.equipo_local_id);
      if (p.equipo_visitante_id) actuales.add(p.equipo_visitante_id);
    });
    const nuevos = new Set(clasificadosIds.filter(Boolean));
    const cambio = nuevos.size !== actuales.size || [...nuevos].some((id) => !actuales.has(id));
    if (cambio) {
      return {
        recalculado: false,
        advertencia: 'Este resultado cambia quién debería clasificar a la fase eliminatoria, pero la primera ronda de esa fase ya se jugó. El cuadro NO se actualizó solo: revísalo y corrígelo a mano si hace falta.'
      };
    }
    return { recalculado: false };
  }

  // Se recalcula siempre que nada se haya jugado todavía — esto es lo que permite
  // que, si se corrige un resultado de la fase previa (ej. por una impugnación)
  // antes de que arranque la eliminatoria, el cuadro se actualice solo con quién
  // clasifica de verdad.
  await aplicarOrdenSemillas(pool, faseElim, ronda1, clasificadosIds);
  return { recalculado: true };
}

// Asigna los equipos reales a la primera ronda según el orden de semillas guardado
// en cada partido (orden_semilla_local/visitante, editable con
// PUT /fases/:id/orden-semillas antes de jugar). En modo "sorteo" primero se baraja
// la lista de clasificados al azar y luego se aplica ese mismo orden de semillas.
async function aplicarOrdenSemillas(pool, faseElim, ronda1, clasificadosIds) {
  const orden = faseElim.modo === 'sorteo' ? barajar(clasificadosIds) : clasificadosIds;
  for (const partido of ronda1) {
    const local = orden[partido.orden_semilla_local] ?? null;
    const visitante = orden[partido.orden_semilla_visitante] ?? null;
    await pool.query(
      'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2 WHERE id = $3',
      [local, visitante, partido.id]
    );
    // Si esta llave se juega ida y vuelta, sincroniza la vuelta con los mismos
    // equipos pero invertidos (local <-> visitante).
    await pool.query(
      'UPDATE partidos SET equipo_local_id = $1, equipo_visitante_id = $2 WHERE partido_ida_id = $3',
      [visitante, local, partido.id]
    );
  }
}

// Devuelve, en el mismo orden que usa calcularClasificadosDe* + armarCrucesIniciales,
// una etiqueta de texto por cada puesto que clasifica (ej. "1°", o "2° Grupo B", o
// "Mejor 3°"), para poder mostrar "quién se espera" en cada casilla de la primera
// ronda mientras todavía no se sabe. Si el sorteo es aleatorio, no se puede anticipar
// y devuelve null.
async function generarEtiquetasRonda1(pool, fase) {
  if (fase.modo === 'sorteo') return null;

  if (fase.clasifican_de_fixture) {
    return Array.from({ length: fase.clasifican }, (_, i) => `${i + 1}°`);
  }

  const { rows: origenRows } = await pool.query('SELECT * FROM fases WHERE id = $1', [fase.fase_origen_id]);
  const origen = origenRows[0];
  if (!origen) return null;

  const { rows: grupos } = await pool.query('SELECT * FROM grupos WHERE fase_id = $1 ORDER BY nombre', [origen.id]);
  const etiquetas = [];
  for (let puesto = 0; puesto < origen.clasifican; puesto++) {
    for (const grupo of grupos) etiquetas.push(`${puesto + 1}° ${grupo.nombre}`);
  }
  for (let i = 0; i < origen.mejores_terceros; i++) {
    etiquetas.push(origen.mejores_terceros > 1 ? `Mejor 3° #${i + 1}` : 'Mejor 3°');
  }
  return etiquetas;
}

module.exports = {
  calcularClasificadosDeGrupos, calcularClasificadosDeFixture,
  crearEsqueletoCompleto, intentarLlenarPrimeraRonda, generarEtiquetasRonda1, aplicarOrdenSemillas,
  obtenerSorteos
};
