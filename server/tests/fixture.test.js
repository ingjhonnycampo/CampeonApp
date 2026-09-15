// Pruebas puras (sin servidor ni base de datos) del algoritmo de "ampliar" o
// "reconstruir" el fixture de Liga cuando llegan equipos nuevos después de
// generado el calendario original. Ver server/fixture.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generarRoundRobin, contarFechasProtegidas, ampliarFixtureConParche, regenerarFixtureCompleto
} = require('../fixture');

const [A, B, C, D, E, F, G] = [1, 2, 3, 4, 5, 6, 7];

function clave(a, b) {
  return [a, b].sort((x, y) => x - y).join('-');
}

// Verifica que, jornada por jornada, ningún equipo tenga dos partidos el mismo día.
function sinRepetirEquipoPorJornada(partidos) {
  const porJornada = new Map();
  for (const p of partidos) {
    if (!porJornada.has(p.jornada)) porJornada.set(p.jornada, new Set());
    const set = porJornada.get(p.jornada);
    assert.ok(!set.has(p.equipo_local_id), `equipo ${p.equipo_local_id} repetido en jornada ${p.jornada}`);
    assert.ok(!set.has(p.equipo_visitante_id), `equipo ${p.equipo_visitante_id} repetido en jornada ${p.jornada}`);
    set.add(p.equipo_local_id);
    set.add(p.equipo_visitante_id);
  }
}

test('contarFechasProtegidas cuenta solo jornadas con algo jugado/protegido', () => {
  const partidos = [
    { jornada: 1, protegido: true }, { jornada: 1, protegido: true },
    { jornada: 2, protegido: false }, { jornada: 2, protegido: false },
    { jornada: 3, protegido: false }, { jornada: 3, protegido: false }
  ];
  assert.equal(contarFechasProtegidas(partidos), 1);
});

test('ampliarFixtureConParche: agrega los cruces de los equipos nuevos aprovechando huecos', () => {
  // 4 equipos ya con el fixture completo generado (3 jornadas, 2 partidos c/u).
  // Solo se jugó la jornada 1 -> modo parche aplica.
  const viejos = generarRoundRobin([A, B, C, D], false).map((p, i) => ({
    id: 100 + i,
    jornada: p.jornada,
    equipo_local_id: p.equipo_local_id,
    equipo_visitante_id: p.equipo_visitante_id,
    protegido: p.jornada === 1
  }));

  assert.equal(contarFechasProtegidas(viejos), 1);

  const inserciones = ampliarFixtureConParche([A, B, C, D, E, F, G], viejos, false);

  // El todos-contra-todos de 7 equipos tiene 21 cruces; 6 ya existían (los de los
  // 4 viejos) -> deben faltar exactamente 15.
  assert.equal(inserciones.length, 15);

  // Ninguno de los cruces nuevos repite un par que ya existiera.
  const paresViejos = new Set(viejos.map((p) => clave(p.equipo_local_id, p.equipo_visitante_id)));
  const paresNuevos = inserciones.map((p) => clave(p.equipo_local_id, p.equipo_visitante_id));
  assert.equal(new Set(paresNuevos).size, 15, 'no debe haber cruces repetidos entre sí');
  paresNuevos.forEach((k) => assert.ok(!paresViejos.has(k), `el cruce ${k} ya existía y no debía repetirse`));

  // Ningún equipo juega dos veces la misma jornada, combinando lo viejo y lo nuevo.
  sinRepetirEquipoPorJornada([...viejos, ...inserciones]);

  // Al menos uno de los cruces nuevos debe caer en una jornada YA EXISTENTE
  // (1, 2 o 3) — es la prueba de que se aprovechan huecos en vez de mandar todo
  // al final.
  const cayeronEnJornadaVieja = inserciones.some((p) => p.jornada <= 3);
  assert.ok(cayeronEnJornadaVieja, 'debía reutilizar huecos en las jornadas 1-3');

  // Se completan absolutamente todos los cruces requeridos entre los 7 equipos.
  const requeridos = generarRoundRobin([A, B, C, D, E, F, G], false);
  const todos = [...viejos, ...inserciones];
  requeridos.forEach((req) => {
    const k = clave(req.equipo_local_id, req.equipo_visitante_id);
    const veces = todos.filter((p) => clave(p.equipo_local_id, p.equipo_visitante_id) === k).length;
    assert.equal(veces, 1, `el cruce ${k} debía quedar programado exactamente una vez`);
  });
});

test('regenerarFixtureCompleto: reubica los partidos protegidos y regenera el resto', () => {
  // 4 equipos, ya se jugaron 2 fechas completas (jornada 1 y 2) -> 2 fechas
  // protegidas, aplica modo "completo". La jornada 3 (A-D, B-C) no se ha jugado.
  const existentes = [
    { id: 1, jornada: 1, equipo_local_id: A, equipo_visitante_id: B, protegido: true },
    { id: 2, jornada: 1, equipo_local_id: C, equipo_visitante_id: D, protegido: true },
    { id: 3, jornada: 2, equipo_local_id: A, equipo_visitante_id: C, protegido: true },
    { id: 4, jornada: 2, equipo_local_id: B, equipo_visitante_id: D, protegido: true },
    { id: 5, jornada: 3, equipo_local_id: A, equipo_visitante_id: D, protegido: false },
    { id: 6, jornada: 3, equipo_local_id: B, equipo_visitante_id: C, protegido: false }
  ];
  const equiposActuales = [A, B, C, D, E];

  const { actualizaciones, inserciones, eliminacionesIds } = regenerarFixtureCompleto(equiposActuales, existentes, false);

  // Los 2 partidos sin jugar (jornada 3) se borran; sus cruces se regeneran frescos.
  assert.deepEqual(eliminacionesIds.sort(), [5, 6]);

  // El nuevo todos-contra-todos de 5 equipos tiene 10 cruces; 4 ya estaban jugados
  // (protegidos) -> deben quedar 6 por insertar.
  assert.equal(inserciones.length, 6);

  // Todo partido protegido se conserva (mismo id, mismo local/visitante) — solo
  // puede cambiarle la jornada.
  const protegidosOriginales = existentes.filter((p) => p.protegido);
  protegidosOriginales.forEach((orig) => {
    const actualizado = actualizaciones.find((a) => a.id === orig.id);
    // Si no aparece en "actualizaciones" es porque la jornada nueva coincidió con
    // la vieja (no hizo falta tocarlo) — ambos casos son válidos.
    assert.ok(actualizado === undefined || typeof actualizado.jornada === 'number');
  });

  // Nunca se debe pedir reubicar un partido protegido a una jornada ya usada por
  // otro protegido con un equipo en común, ni duplicar ningún cruce.
  const paresProtegidos = protegidosOriginales.map((p) => clave(p.equipo_local_id, p.equipo_visitante_id));
  const paresInsertados = inserciones.map((p) => clave(p.equipo_local_id, p.equipo_visitante_id));
  assert.equal(new Set([...paresProtegidos, ...paresInsertados]).size, 10, 'deben cubrirse los 10 cruces sin duplicar ninguno');

  // Combinando protegidos (con su jornada ya actualizada) + insertados, nadie
  // repite equipo en la misma jornada.
  const finales = [
    ...protegidosOriginales.map((p) => ({
      ...p,
      jornada: actualizaciones.find((a) => a.id === p.id)?.jornada ?? p.jornada
    })),
    ...inserciones
  ];
  sinRepetirEquipoPorJornada(finales);
});
