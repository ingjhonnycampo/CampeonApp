const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, slugDePrueba, limpiarDatosDePrueba, pool } = require('./setup');

// Torneo con el primer tiempo de solo 1 minuto, para poder empujarlo a tiempo
// de adición sin tener que simular un partido entero.
async function armarPartidoListo() {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado, duracion_tiempo_1, duracion_tiempo_2)
     VALUES ('Test', $1, 'microfutbol', 'liga', true, 1, 1) RETURNING id`,
    [slugDePrueba('adicion')]
  );
  const { rows: [eA] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'A', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [eB] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'B', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [j] } = await pool.query(
    `INSERT INTO jugadores (equipo_id, nombre, fecha_nacimiento, cedula) VALUES ($1, 'Goleador', '2000-01-01', $2) RETURNING id`,
    [eA.id, 'ced-' + Math.random()]
  );
  const { rows: [p] } = await pool.query(
    `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado, fecha_hora)
     VALUES ($1, 1, $2, $3, 'programado', now() - interval '5 minutes') RETURNING id`,
    [t.id, eA.id, eB.id]
  );
  return { torneoId: t.id, partidoId: p.id, jugadorId: j.id };
}

test('tiempo de adición', async (t) => {
  const { server, baseUrl } = await iniciarApp();
  const arbitro = await crearUsuario({ rol: 'arbitro' });
  const { torneoId, partidoId, jugadorId } = await armarPartidoListo();
  await pool.query(`INSERT INTO torneo_arbitros (torneo_id, usuario_id) VALUES ($1, (SELECT id FROM usuarios WHERE email = $2))`, [torneoId, arbitro.email]);
  const cookie = await login(baseUrl, arbitro.email, arbitro.password);

  t.after(async () => {
    server.close();
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('preparación: inicia el partido y el primer tiempo', async () => {
    await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookie) });
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/cronometro/iniciar-tiempo`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 200);
  });

  await t.test('un gol a los 65 segundos (5s pasado el minuto 1 de duración) queda como "1+1"', async () => {
    await pool.query(`UPDATE partidos SET cronometro_acumulado_seg = 65, cronometro_inicio = now() WHERE id = $1`, [partidoId]);

    const r = await fetch(`${baseUrl}/planilla/${partidoId}/gol`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ jugador_id: jugadorId, en_propia_puerta: false })
    });
    assert.equal(r.status, 201);
    const gol = await r.json();
    assert.equal(gol.minuto, 1, 'el minuto queda congelado en la duración configurada (1)');
    assert.equal(gol.minuto_adicion, 1, '5 segundos de adición caen en el minuto de adición 1');
  });

  await t.test('una tarjeta en el mismo momento también queda marcada con la adición', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/tarjeta`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ jugador_id: jugadorId, tipo: 'amarilla' })
    });
    assert.equal(r.status, 201);
    const tarjeta = await r.json();
    assert.equal(tarjeta.minuto, 1);
    assert.equal(tarjeta.minuto_adicion, 1);
  });

  await t.test('finalizar el tiempo en plena adición deja el hito "fin_primer_tiempo" con la adición correcta', async () => {
    // Sigue en 65s acumulados (avanza un poco más desde que arrancó el cronómetro
    // en el paso anterior, pero se recalcula igual: > 60s de duración = adición).
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/cronometro/finalizar-tiempo`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 200);

    const { rows } = await pool.query(
      `SELECT minuto, minuto_adicion FROM partido_hitos WHERE partido_id = $1 AND tipo = 'fin_primer_tiempo'`,
      [partidoId]
    );
    assert.equal(rows[0].minuto, 1, 'el hito de fin de tiempo también queda congelado en la duración');
    assert.ok(rows[0].minuto_adicion >= 1, 'y con algo de adición corrida');
  });
});
