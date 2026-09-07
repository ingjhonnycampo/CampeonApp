const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, slugDePrueba, limpiarDatosDePrueba } = require('./setup');
const { calcularSanciones } = require('../sanciones');

// Crea un torneo de prueba con 2 equipos y un jugador, y "jornadaN" partidos ya
// listos (jornada 1 jugada, donde se ponen las tarjetas; 2, 3 y 4 pendientes,
// para poder verificar cuáles quedan bloqueadas).
async function armarTorneo() {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado) VALUES ('Test', $1, 'futbol', 'liga', true) RETURNING id`,
    [slugDePrueba('sanciones')]
  );
  const { rows: [eA] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'A', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [eB] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'B', 'aprobado') RETURNING id`, [t.id]);
  const jornadas = {};
  for (let j = 1; j <= 4; j++) {
    const estado = j === 1 ? 'jugado' : 'programado';
    const { rows: [p] } = await pool.query(
      `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [t.id, j, eA.id, eB.id, estado]
    );
    jornadas[j] = p.id;
  }
  return { torneoId: t.id, equipoId: eA.id, jornadas };
}

async function crearJugador(equipoId, nombre) {
  const { rows: [j] } = await pool.query(
    `INSERT INTO jugadores (equipo_id, nombre, fecha_nacimiento, cedula) VALUES ($1, $2, '2000-01-01', $3) RETURNING id`,
    [equipoId, nombre, nombre + Math.random()]
  );
  return j.id;
}

test('sanciones', async (t) => {
  t.after(async () => {
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('amarilla simple: bloquea el partido siguiente y todos los de después hasta habilitar', async () => {
    const { torneoId, equipoId, jornadas } = await armarTorneo();
    const jugadorId = await crearJugador(equipoId, 'Amarilla');
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'amarilla')`, [jornadas[1], equipoId, jugadorId]);

    const activas = await calcularSanciones(pool, torneoId);
    const s = activas.find((x) => x.jugadorId === jugadorId);
    assert.ok(s, 'debería aparecer como sancionado');
    assert.equal(s.tipoSancion, 'amarilla');
    assert.equal(s.partidosObligatorios, 0);
    assert.equal(s.requierePago, true, 'sin mínimo obligatorio, ya se puede habilitar de una');
    assert.deepEqual(s.partidosBloqueadosIds, [jornadas[2], jornadas[3], jornadas[4]], 'bloquea TODAS las fechas siguientes hasta que paguen, no solo la próxima');
  });

  await t.test('doble amarilla: 1 fecha obligatoria que el pago no salta', async () => {
    const { torneoId, equipoId, jornadas } = await armarTorneo();
    const jugadorId = await crearJugador(equipoId, 'DobleAmarilla');
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'amarilla')`, [jornadas[1], equipoId, jugadorId]);
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'amarilla')`, [jornadas[1], equipoId, jugadorId]);
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo, doble_amarilla) VALUES ($1, $2, $3, 'roja', true)`, [jornadas[1], equipoId, jugadorId]);

    let activas = await calcularSanciones(pool, torneoId);
    let s = activas.find((x) => x.jugadorId === jugadorId);
    assert.equal(s.tipoSancion, 'doble_amarilla');
    assert.equal(s.partidosObligatorios, 1);
    assert.equal(s.partidosObligatoriosPendientes, 1);
    assert.equal(s.requierePago, false, 'todavía no puede pagar: falta cumplir la fecha obligatoria');
    assert.equal(activas.filter((x) => x.jugadorId === jugadorId).length, 1, 'las 2 amarillas del mismo partido no deben generar sanción aparte');

    // Se juega la fecha obligatoria (jornada 2) sin que nadie pague nada.
    await pool.query(`UPDATE partidos SET estado = 'jugado', goles_local = 1, goles_visitante = 0 WHERE id = $1`, [jornadas[2]]);
    activas = await calcularSanciones(pool, torneoId);
    s = activas.find((x) => x.jugadorId === jugadorId);
    assert.equal(s.partidosObligatoriosPendientes, 0, 'ya cumplió la fecha obligatoria');
    assert.equal(s.requierePago, true, 'ahora sí puede pagar para la que sigue');
    assert.deepEqual(s.partidosBloqueadosIds, [jornadas[3], jornadas[4]]);
  });

  await t.test('roja directa: 2 fechas obligatorias', async () => {
    const { torneoId, equipoId, jornadas } = await armarTorneo();
    const jugadorId = await crearJugador(equipoId, 'RojaDirecta');
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'roja')`, [jornadas[1], equipoId, jugadorId]);

    const activas = await calcularSanciones(pool, torneoId);
    const s = activas.find((x) => x.jugadorId === jugadorId);
    assert.equal(s.tipoSancion, 'roja_directa');
    assert.equal(s.partidosObligatorios, 2);
    assert.equal(s.partidosObligatoriosPendientes, 2);
    assert.equal(s.requierePago, false);
  });

  await t.test('habilitar hace que el jugador deje de aparecer como sancionado', async () => {
    const { torneoId, equipoId, jornadas } = await armarTorneo();
    const jugadorId = await crearJugador(equipoId, 'Habilitado');
    const { rows: [tarjeta] } = await pool.query(
      `INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'amarilla') RETURNING id`,
      [jornadas[1], equipoId, jugadorId]
    );

    let activas = await calcularSanciones(pool, torneoId);
    assert.ok(activas.find((x) => x.jugadorId === jugadorId), 'debería estar sancionado antes de habilitar');

    await pool.query(`INSERT INTO sancion_habilitaciones (tarjeta_id) VALUES ($1)`, [tarjeta.id]);

    activas = await calcularSanciones(pool, torneoId);
    assert.ok(!activas.find((x) => x.jugadorId === jugadorId), 'ya no debería aparecer como sancionado');
  });

  await t.test('reglas de sanción personalizadas por torneo (fechas y multa configurables)', async () => {
    const { torneoId, equipoId, jornadas } = await armarTorneo();
    await pool.query(
      `INSERT INTO torneo_reglas_sancion (torneo_id, tipo_sancion, fechas_obligatorias, multa) VALUES ($1, 'amarilla', 2, 25000)`,
      [torneoId]
    );
    const jugadorId = await crearJugador(equipoId, 'ReglaCustom');
    await pool.query(`INSERT INTO partido_tarjetas (partido_id, equipo_id, jugador_id, tipo) VALUES ($1, $2, $3, 'amarilla')`, [jornadas[1], equipoId, jugadorId]);

    const activas = await calcularSanciones(pool, torneoId);
    const s = activas.find((x) => x.jugadorId === jugadorId);
    assert.equal(s.partidosObligatorios, 2, 'debería usar los 2 fechas configuradas para este torneo, no el default de 0');
    assert.equal(s.multa, 25000);
  });
});
