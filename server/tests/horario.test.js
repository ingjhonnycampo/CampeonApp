// Validación de cruce de horario: cada partido ocupa 1 hora de cancha, y dos
// campeonatos distintos pueden compartir cancha — así que el cruce se revisa
// contra TODOS los partidos, no solo los del mismo torneo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, slugDePrueba, limpiarDatosDePrueba, pool } = require('./setup');

async function crearTorneoConPartido(nombreEquipoLocal) {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado)
     VALUES ('Test', $1, 'microfutbol', 'liga', true) RETURNING id`,
    [slugDePrueba('horario')]
  );
  const { rows: [eA] } = await pool.query(
    `INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, $2, 'aprobado') RETURNING id`, [t.id, nombreEquipoLocal]
  );
  const { rows: [eB] } = await pool.query(
    `INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'Rival', 'aprobado') RETURNING id`, [t.id]
  );
  const { rows: [p] } = await pool.query(
    `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado)
     VALUES ($1, 1, $2, $3, 'programado') RETURNING id`,
    [t.id, eA.id, eB.id]
  );
  return { torneoId: t.id, partidoId: p.id };
}

test('cruce de horarios entre partidos', async (t) => {
  const { server, baseUrl } = await iniciarApp();
  const admin = await crearUsuario({ rol: 'admin' });
  const cookie = await login(baseUrl, admin.email, admin.password);
  const headers = conCookie(cookie);

  const torneoA = await crearTorneoConPartido('Equipo Torneo A');
  const torneoB = await crearTorneoConPartido('Equipo Torneo B');

  t.after(async () => {
    server.close();
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('programa el primer partido sin problema', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoA.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: '2027-01-10T18:00:00.000Z' })
    });
    assert.equal(r.status, 200);
  });

  await t.test('rechaza otro partido (de OTRO campeonato) a la misma hora', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoB.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: '2027-01-10T18:00:00.000Z' })
    });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.match(data.error, /se cruza/);
  });

  await t.test('rechaza un horario a 30 minutos de diferencia (se solapa)', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoB.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: '2027-01-10T18:30:00.000Z' })
    });
    assert.equal(r.status, 400);
  });

  await t.test('permite un horario a exactamente 1 hora de diferencia', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoB.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: '2027-01-10T19:00:00.000Z' })
    });
    assert.equal(r.status, 200);
  });

  await t.test('no se cruza consigo mismo al reprogramar al mismo horario', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoA.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: '2027-01-10T18:00:00.000Z' })
    });
    assert.equal(r.status, 200);
  });

  await t.test('quitar el horario (fecha_hora null) nunca se bloquea', async () => {
    const r = await fetch(`${baseUrl}/partidos/${torneoA.partidoId}/horario`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fecha_hora: null })
    });
    assert.equal(r.status, 200);
  });
});
