const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, slugDePrueba, limpiarDatosDePrueba, pool } = require('./setup');

async function armarTorneo() {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado) VALUES ('Test', $1, 'microfutbol', 'liga', true) RETURNING id`,
    [slugDePrueba('expulsion')]
  );
  const { rows: [eA] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'A', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [eB] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'B', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [j] } = await pool.query(
    `INSERT INTO jugadores (equipo_id, nombre, fecha_nacimiento, cedula) VALUES ($1, 'Agresor', '2000-01-01', $2) RETURNING id`,
    [eA.id, 'ced-' + Math.random()]
  );
  const { rows: [p] } = await pool.query(
    `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado, fecha_hora, confirmado_local, confirmado_visitante)
     VALUES ($1, 1, $2, $3, 'programado', now() - interval '1 hour', true, true) RETURNING id`,
    [t.id, eA.id, eB.id]
  );
  return { torneoId: t.id, equipoId: eA.id, jugadorId: j.id, partidoId: p.id };
}

test('expulsiones del campeonato', async (t) => {
  const { server, baseUrl } = await iniciarApp();
  const organizador = await crearUsuario({ rol: 'organizador' });
  const arbitro = await crearUsuario({ rol: 'arbitro' });
  const { torneoId, equipoId, jugadorId, partidoId } = await armarTorneo();
  await pool.query(
    `INSERT INTO torneo_arbitros (torneo_id, usuario_id) VALUES ($1, (SELECT id FROM usuarios WHERE email = $2)), ($1, (SELECT id FROM usuarios WHERE email = $3))`,
    [torneoId, organizador.email, arbitro.email]
  );
  const cookieOrganizador = await login(baseUrl, organizador.email, organizador.password);
  const cookieArbitro = await login(baseUrl, arbitro.email, arbitro.password);

  let expulsionId;

  t.after(async () => {
    server.close();
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('el árbitro NO puede expulsar jugadores (solo organizador/admin)', async () => {
    const r = await fetch(`${baseUrl}/sanciones/expulsar`, {
      method: 'POST', headers: conCookie(cookieArbitro),
      body: JSON.stringify({ jugador_id: jugadorId, motivo: 'x', multa: 0 })
    });
    assert.equal(r.status, 403);
  });

  await t.test('el organizador expulsa al jugador', async () => {
    const r = await fetch(`${baseUrl}/sanciones/expulsar`, {
      method: 'POST', headers: conCookie(cookieOrganizador),
      body: JSON.stringify({ jugador_id: jugadorId, motivo: 'Agresión a un árbitro', multa: 200000 })
    });
    assert.equal(r.status, 201);
    expulsionId = (await r.json()).id;
  });

  await t.test('el equipo queda bloqueado: no puede iniciar el partido', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookieArbitro) });
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.match(data.error, /multa/i);
  });

  await t.test('el jugador expulsado aparece marcado en la planilla', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}`, { headers: conCookie(cookieArbitro) });
    const data = await r.json();
    const jugador = data.convocadosLocal.find((j) => j.id === jugadorId);
    assert.equal(jugador.expulsado, true);
    assert.equal(jugador.suspendido, true);
  });

  await t.test('al confirmar el pago, el equipo puede volver a jugar', async () => {
    const rPago = await fetch(`${baseUrl}/sanciones/expulsion/${expulsionId}/pagar`, { method: 'POST', headers: conCookie(cookieOrganizador) });
    assert.equal(rPago.status, 200);

    const r = await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookieArbitro) });
    const data = await r.json();
    assert.doesNotMatch(data.error || '', /multa/i, 'ya no debería bloquear por la multa (puede fallar por otra razón, como falta de alineación)');
  });

  await t.test('el jugador SIGUE expulsado permanentemente aunque ya se pagó la multa', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}`, { headers: conCookie(cookieArbitro) });
    const data = await r.json();
    const jugador = data.convocadosLocal.find((j) => j.id === jugadorId);
    assert.equal(jugador.expulsado, true, 'pagar la multa libera al equipo, pero el jugador nunca vuelve');
  });

  await t.test('la lista pública de expulsiones muestra el estado correcto', async () => {
    const { rows: [torneo] } = await pool.query('SELECT slug FROM torneos WHERE id = $1', [torneoId]);
    const r = await fetch(`${baseUrl}/publico/torneos/${torneo.slug}/expulsiones`);
    const data = await r.json();
    assert.equal(data.length, 1);
    assert.equal(data[0].pagado, true);
    assert.equal(data[0].jugadorNombre, 'Agresor');
  });
});
