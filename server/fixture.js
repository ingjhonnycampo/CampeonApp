// Sorteo de todos-contra-todos (metodo del circulo). Si hay un numero impar de
// equipos, se agrega un "descanso" (null): esa jornada, el equipo que quedo
// emparejado con el hueco no juega dentro de su grupo (ver generarRoundRobinConDescansos
// para saber exactamente quien descansa en cada jornada).
function generarRoundRobin(equipoIds, idaYVuelta = false) {
  return generarRoundRobinConDescansos(equipoIds, idaYVuelta).partidos;
}

// Igual que generarRoundRobin, pero ademas devuelve, jornada por jornada, que
// equipo le tocó descansar (solo aplica si la cantidad de equipos es impar). Se usa
// para armar el partido intergrupo entre los equipos que descansan de dos grupos.
// Con idaYVuelta=true, despues de la vuelta completa (todos contra todos una vez)
// se repite el mismo calendario con local/visitante invertidos, en las jornadas
// siguientes — asi ningun equipo repite rival de una jornada a la otra.
function generarRoundRobinConDescansos(equipoIds, idaYVuelta = false) {
  const equipos = [...equipoIds];
  const partidosIda = [];
  const descansosIda = {};
  if (equipos.length < 2) return { partidos: partidosIda, descansos: descansosIda };
  if (equipos.length % 2 !== 0) equipos.push(null);

  const n = equipos.length;
  const rondas = n - 1;
  let arreglo = equipos.slice();

  for (let r = 0; r < rondas; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arreglo[i];
      const b = arreglo[n - 1 - i];
      if (a !== null && b !== null) {
        const [local, visitante] = r % 2 === 0 ? [a, b] : [b, a];
        partidosIda.push({ jornada: r + 1, equipo_local_id: local, equipo_visitante_id: visitante });
      } else {
        descansosIda[r + 1] = a === null ? b : a;
      }
    }
    const fijo = arreglo[0];
    const resto = arreglo.slice(1);
    resto.unshift(resto.pop());
    arreglo = [fijo, ...resto];
  }

  if (!idaYVuelta) return { partidos: partidosIda, descansos: descansosIda };

  const partidosVuelta = partidosIda.map((p) => ({
    jornada: p.jornada + rondas,
    equipo_local_id: p.equipo_visitante_id,
    equipo_visitante_id: p.equipo_local_id
  }));
  const descansosVuelta = {};
  Object.entries(descansosIda).forEach(([jornada, equipoId]) => {
    descansosVuelta[Number(jornada) + rondas] = equipoId;
  });

  return {
    partidos: [...partidosIda, ...partidosVuelta],
    descansos: { ...descansosIda, ...descansosVuelta }
  };
}

// Empareja, jornada por jornada, a los equipos que descansan en distintos grupos
// para armar el partido intergrupo (ver generarRoundRobinConDescansos). Evita
// repetir el mismo cruce dos veces cuando hay alguna alternativa disponible; si dos
// grupos SIEMPRE tienen exactamente los mismos descansos, puede tocar repetir.
// listaPorJornada: { [jornada]: [{ equipoId }, ...] } (equipos que descansan esa jornada)
function emparejarDescansos(listaPorJornada) {
  const cruces = [];
  const usados = new Set();
  const clave = (a, b) => [a, b].sort((x, y) => x - y).join('-');

  for (const jornada of Object.keys(listaPorJornada)) {
    const disponibles = [...listaPorJornada[jornada]];
    while (disponibles.length >= 2) {
      const a = disponibles.shift();
      let indice = disponibles.findIndex((b) => !usados.has(clave(a.equipoId, b.equipoId)));
      if (indice === -1) indice = 0;
      const [b] = disponibles.splice(indice, 1);
      cruces.push({ jornada: Number(jornada), equipo_local_id: a.equipoId, equipo_visitante_id: b.equipoId });
      usados.add(clave(a.equipoId, b.equipoId));
    }
  }

  return cruces;
}

// Tabla de posiciones a partir de los partidos jugados. Desempate, en orden:
// puntos -> diferencia de gol general -> enfrentamiento directo entre los
// empatados (puntos, diferencia y goles a favor SOLO en los partidos que
// jugaron entre ellos) -> goles a favor general. Si un grupo de 2 o más equipos
// sigue exactamente empatado despues de todo eso, no hay ningun criterio
// deportivo que los distinga: se marca requiere_sorteo=true (y grupo_empate con
// los ids involucrados) para que la interfaz ofrezca sortear el puesto, y
// mientras tanto se muestran en orden alfabetico solo como algo provisional
// para no dejar la tabla en blanco.
function calcularPosiciones(equipos, partidos, sorteos = []) {
  const tabla = new Map();
  for (const eq of equipos) {
    tabla.set(eq.id, {
      equipo_id: eq.id, nombre: eq.nombre, escudo_url: eq.escudo_url,
      estado_torneo: eq.estado_torneo || 'activo', baja_motivo: eq.baja_motivo || null,
      pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0, pts: 0
    });
  }

  for (const p of partidos) {
    if (p.estado !== 'jugado' || p.goles_local === null || p.goles_visitante === null) continue;
    const local = tabla.get(p.equipo_local_id);
    const visitante = tabla.get(p.equipo_visitante_id);
    if (!local && !visitante) continue;

    // Cada lado se actualiza de forma independiente (en vez de exigir que ambos
    // esten en esta tabla) para que un partido intergrupo — entre el equipo que
    // descansa de un grupo y el que descansa de otro — sume solo del lado del
    // equipo que pertenece a este grupo, sin que el rival de afuera aparezca aqui.
    if (local) {
      local.pj++; local.gf += p.goles_local; local.gc += p.goles_visitante;
      if (p.goles_local > p.goles_visitante) { local.pg++; local.pts += 3; }
      else if (p.goles_local < p.goles_visitante) { local.pp++; }
      else { local.pe++; local.pts += 1; }
    }
    if (visitante) {
      visitante.pj++; visitante.gf += p.goles_visitante; visitante.gc += p.goles_local;
      if (p.goles_visitante > p.goles_local) { visitante.pg++; visitante.pts += 3; }
      else if (p.goles_visitante < p.goles_local) { visitante.pp++; }
      else { visitante.pe++; visitante.pts += 1; }
    }
  }

  const todas = [...tabla.values()].map((f) => ({ ...f, dif: f.gf - f.gc }));

  // Los equipos retirados o descalificados no compiten por la tabla: quedan al
  // final, sin importar los puntos que hayan sacado, y nunca entran al proceso de
  // desempate (ni siquiera entre ellos: su orden ahi no importa, va alfabetico).
  // Sus resultados ya jugados se mantienen — le siguen contando al rival que sí
  // les ganó, solo que ellos mismos no compiten mas por la tabla.
  const filas = todas.filter((f) => f.estado_torneo === 'activo');
  const deBaja = todas.filter((f) => f.estado_torneo !== 'activo').sort((a, b) => a.nombre.localeCompare(b.nombre));

  filas.sort((a, b) => b.pts - a.pts || a.nombre.localeCompare(b.nombre));

  // Agrupa por puntos (el primer criterio) y resuelve cada grupo empatado aparte.
  const resultado = [];
  let i = 0;
  while (i < filas.length) {
    let j = i + 1;
    while (j < filas.length && filas[j].pts === filas[i].pts) j++;
    resultado.push(...ordenarPorDiferenciaGeneral(filas.slice(i, j), partidos, sorteos));
    i = j;
  }

  return [...resultado, ...deBaja];
}

// Segundo criterio: diferencia de gol general. Dentro de cada grupo ya empatado
// en puntos, separa por diferencia y sigue desempatando cada uno de esos
// subgrupos con el enfrentamiento directo.
function ordenarPorDiferenciaGeneral(grupoPts, partidos, sorteos) {
  if (grupoPts.length === 1) return grupoPts;

  const ordenado = [...grupoPts].sort((a, b) => b.dif - a.dif || a.nombre.localeCompare(b.nombre));
  const resultado = [];
  let i = 0;
  while (i < ordenado.length) {
    let j = i + 1;
    while (j < ordenado.length && ordenado[j].dif === ordenado[i].dif) j++;
    resultado.push(...ordenarGrupoEmpatado(ordenado.slice(i, j), partidos, sorteos));
    i = j;
  }
  return resultado;
}

// Calcula, SOLO con los partidos jugados entre los equipos de "ids", una mini
// tabla de puntos/goles (la "mini-liguilla" que usan la mayoria de ligas para
// desempatar entre 2 o mas equipos con los mismos puntos).
function miniLiga(ids, partidos) {
  const mini = new Map(ids.map((id) => [id, { pts: 0, gf: 0, gc: 0 }]));
  for (const p of partidos) {
    if (p.estado !== 'jugado' || p.goles_local === null || p.goles_visitante === null) continue;
    if (!mini.has(p.equipo_local_id) || !mini.has(p.equipo_visitante_id)) continue;
    const l = mini.get(p.equipo_local_id);
    const v = mini.get(p.equipo_visitante_id);
    l.gf += p.goles_local; l.gc += p.goles_visitante;
    v.gf += p.goles_visitante; v.gc += p.goles_local;
    if (p.goles_local > p.goles_visitante) l.pts += 3;
    else if (p.goles_local < p.goles_visitante) v.pts += 3;
    else { l.pts += 1; v.pts += 1; }
  }
  return mini;
}

// Ordena un grupo de equipos ya empatados en puntos Y diferencia de gol general,
// usando el enfrentamiento directo entre ellos (mini-liguilla) y despues los
// goles a favor generales. Los subgrupos que sigan empatados en TODO se
// resuelven por sorteo si ya hay uno guardado para exactamente ese conjunto de
// equipos, o quedan marcados requiere_sorteo si todavia no.
function ordenarGrupoEmpatado(grupo, partidos, sorteos) {
  if (grupo.length === 1) return grupo;

  const mini = miniLiga(grupo.map((f) => f.equipo_id), partidos);
  const conMini = grupo.map((f) => {
    const m = mini.get(f.equipo_id);
    return { ...f, _miniPts: m.pts, _miniDif: m.gf - m.gc, _miniGf: m.gf };
  });

  conMini.sort((a, b) =>
    b._miniPts - a._miniPts ||
    b._miniDif - a._miniDif ||
    b._miniGf - a._miniGf ||
    b.gf - a.gf ||
    a.nombre.localeCompare(b.nombre)
  );

  const final = [];
  let i = 0;
  while (i < conMini.length) {
    let j = i + 1;
    while (
      j < conMini.length &&
      conMini[j]._miniPts === conMini[i]._miniPts &&
      conMini[j]._miniDif === conMini[i]._miniDif &&
      conMini[j]._miniGf === conMini[i]._miniGf &&
      conMini[j].gf === conMini[i].gf
    ) j++;
    const subgrupo = conMini.slice(i, j).map(({ _miniPts, _miniDif, _miniGf, ...f }) => f);
    final.push(...(subgrupo.length > 1 ? resolverConSorteo(subgrupo, sorteos) : subgrupo));
    i = j;
  }
  return final;
}

// Un subgrupo que sigue empatado en absolutamente todo (puntos, mini-liguilla,
// diferencia y goles generales) solo se puede resolver con un sorteo. Si ya hay
// uno guardado para exactamente ese conjunto de equipos, se aplica su resultado;
// si no, quedan en orden alfabetico (provisional) marcados con requiere_sorteo.
function resolverConSorteo(subgrupo, sorteos) {
  const ids = subgrupo.map((f) => f.equipo_id);
  const idsSet = new Set(ids);
  const sorteo = sorteos.find((s) =>
    s.equipos_ids.length === idsSet.size && s.equipos_ids.every((id) => idsSet.has(id))
  );

  if (sorteo) {
    const orden = sorteo.orden_resultado;
    return [...subgrupo]
      .sort((a, b) => orden.indexOf(a.equipo_id) - orden.indexOf(b.equipo_id))
      .map((f) => ({
        ...f,
        resuelto_por_sorteo: true,
        sorteo_delegados: sorteo.delegados_presentes,
        sorteo_fecha: sorteo.creado_en
      }));
  }

  const grupoEmpate = [...ids].sort((a, b) => a - b).join('-');
  return [...subgrupo]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((f) => ({ ...f, requiere_sorteo: true, grupo_empate: grupoEmpate }));
}

// Quien gano una llave de eliminatoria. Si es a partido unico (vuelta = null): si
// hubo empate, manda el ganador_id definido a mano (ej. penales); si no, el que
// anoto mas goles. Si es a ida y vuelta: suma el marcador global de las dos
// piernas (la vuelta juega con local/visitante invertidos respecto a la ida) y,
// si el global tambien queda empatado, manda el ganador_id de la VUELTA (penales
// o gol de visitante, lo que se haya usado para desempatar).
function obtenerGanadorId(ida, vuelta = null) {
  if (!vuelta) {
    if (ida.goles_local === ida.goles_visitante) return ida.ganador_id || null;
    return ida.goles_local > ida.goles_visitante ? ida.equipo_local_id : ida.equipo_visitante_id;
  }
  const totalLocal = ida.goles_local + vuelta.goles_visitante;
  const totalVisitante = ida.goles_visitante + vuelta.goles_local;
  if (totalLocal === totalVisitante) return vuelta.ganador_id || null;
  return totalLocal > totalVisitante ? ida.equipo_local_id : ida.equipo_visitante_id;
}

// El equipo que perdio la llave (para el partido por el 3er puesto). Igual que
// obtenerGanadorId, respeta el empate resuelto a mano si aplica.
function obtenerPerdedorId(ida, vuelta = null) {
  const ganadorId = obtenerGanadorId(ida, vuelta);
  if (!ganadorId) return null;
  return ganadorId === ida.equipo_local_id ? ida.equipo_visitante_id : ida.equipo_local_id;
}

// Arma los cruces de la primera ronda de una eliminatoria a partir de una lista
// de clasificados YA ORDENADA por bombo/seed (el primero de la lista es el mejor
// ubicado). Empareja 1 vs ultimo, 2 vs anteultimo, etc. La cantidad debe ser
// potencia de 2 (2, 4, 8, 16...).
function esPotenciaDeDos(n) {
  return n >= 2 && (n & (n - 1)) === 0;
}

function armarCrucesIniciales(clasificadosIds) {
  const n = clasificadosIds.length;
  const partidos = [];
  for (let i = 0; i < n / 2; i++) {
    partidos.push({ jornada: 1, equipo_local_id: clasificadosIds[i], equipo_visitante_id: clasificadosIds[n - 1 - i] });
  }
  return partidos;
}

// Intercala los clasificados de varios grupos: todos los 1eros (en orden de grupo),
// luego todos los 2dos, etc. Asi el cruce inicial evita, en lo posible, que dos
// equipos del mismo grupo se enfrenten en la primera ronda.
function intercalarClasificadosPorGrupo(tablasPorGrupo, cantidadPorGrupo) {
  const resultado = [];
  for (let puesto = 0; puesto < cantidadPorGrupo; puesto++) {
    for (const tabla of tablasPorGrupo) {
      if (tabla[puesto]) resultado.push(tabla[puesto].equipo_id);
    }
  }
  return resultado;
}

// Para cuando el numero de grupos no da un total de clasificados que sea potencia
// de dos (ej. 3 grupos clasificando 2 c/u = 6): toma el equipo que quedo justo
// despues de los que clasifican directo en cada grupo (posicion "clasificanFijo",
// 0-indexada) y elige los mejores "cantidad" de esos, comparando entre grupos con
// el mismo criterio de desempate de siempre.
function obtenerMejoresTerceros(tablasPorGrupo, clasificanFijo, cantidad) {
  const candidatos = tablasPorGrupo.map((tabla) => tabla[clasificanFijo]).filter(Boolean);
  candidatos.sort((a, b) =>
    b.pts - a.pts ||
    b.dif - a.dif ||
    b.gf - a.gf ||
    a.nombre.localeCompare(b.nombre)
  );
  return candidatos.slice(0, cantidad);
}

// Nombre futbolero de una ronda de eliminatoria segun cuantos equipos entran a jugarla.
function nombreRonda(numEquipos) {
  const nombres = {
    2: 'Final',
    4: 'Semifinal',
    8: 'Cuartos de Final',
    16: 'Octavos de Final',
    32: 'Dieciseisavos de Final'
  };
  return nombres[numEquipos] || `Ronda de ${numEquipos}`;
}

// Baraja al azar (Fisher-Yates) para el modo "sorteo".
function barajar(lista) {
  const arreglo = [...lista];
  for (let i = arreglo.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arreglo[i], arreglo[j]] = [arreglo[j], arreglo[i]];
  }
  return arreglo;
}

// Para la tabla de posiciones EN VIVO del público: un partido en curso se cuenta
// como si ya estuviera "jugado" con el marcador que lleva en este momento (quien
// va ganando ya suma sus 3 puntos, un empate ya reparte 1 y 1), sin tocar la BD ni
// afectar la tabla real — es puramente para calcularPosiciones. La tabla vuelve a
// ser la definitiva en cuanto el partido de verdad termina (pasa a 'jugado').
function proyectarPartidosEnCurso(partidos) {
  return partidos.map((p) => (p.estado === 'en_curso' ? { ...p, estado: 'jugado' } : p));
}

// IDs de equipos con un partido en_curso dentro de esta lista, para marcar en la
// tabla cuál posición está "en vivo" ahora mismo.
function equiposEnVivo(partidos) {
  const ids = new Set();
  for (const p of partidos) {
    if (p.estado !== 'en_curso') continue;
    if (p.equipo_local_id) ids.add(p.equipo_local_id);
    if (p.equipo_visitante_id) ids.add(p.equipo_visitante_id);
  }
  return ids;
}

module.exports = {
  generarRoundRobin, generarRoundRobinConDescansos, emparejarDescansos, calcularPosiciones,
  obtenerGanadorId, obtenerPerdedorId,
  esPotenciaDeDos, armarCrucesIniciales, intercalarClasificadosPorGrupo, obtenerMejoresTerceros,
  nombreRonda, barajar, proyectarPartidosEnCurso, equiposEnVivo
};
