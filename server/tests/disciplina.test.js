const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, slugDePrueba, limpiarDatosDePrueba, pool } = require('./setup');

async function armarTorneo() {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado) VALUES ('Test', $1, 'microfutbol', 'liga', true) RETURNING id`,
    [slugDePrueba('disciplina')]
  );
  const { rows: [eA] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'A', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [eB] } = await pool.query(`INSERT INTO equipos (torneo_id, nombre, estado) VALUES ($1, 'B', 'aprobado') RETURNING id`, [t.id]);
  const { rows: [j] } = await pool.query(
    `INSERT INTO jugadores (equipo_id, nombre, fecha_nacimiento, cedula) VALUES ($1, 'Sancionado', '2000-01-01', $2) RETURNING id`,
    [eA.id, 'ced-' + Math.random()]
  );
  const { rows: [p1] } = await pool.query(
    `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado, fecha_hora)
     VALUES ($1, 1, $2, $3, 'programado', now() - interval '1 hour') RETURNING id`,
    [t.id, eA.id, eB.id]
  );
  const { rows: [p2] } = await pool.query(
    `INSERT INTO partidos (torneo_id, jornada, equipo_local_id, equipo_visitante_id, estado, fecha_hora)
     VALUES ($1, 2, $2, $3, 'programado', now()) RETURNING id`,
    [t.id, eB.id, eA.id]
  );
  return { torneoId: t.id, equipoAId: eA.id, equipoBId: eB.id, jugadorId: j.id, partido1Id: p1.id, partido2Id: p2.id };
}

test('disciplina: sanciones de oficio', async (t) => {
  const { server, baseUrl } = await iniciarApp();
  const organizador = await crearUsuario({ rol: 'organizador' });
  const arbitro = await crearUsuario({ rol: 'arbitro' });
  const { torneoId, equipoAId, jugadorId, partido1Id, partido2Id } = await armarTorneo();
  await pool.query(
    `INSERT INTO torneo_arbitros (torneo_id, usuario_id) VALUES ($1, (SELECT id FROM usuarios WHERE email = $2)), ($1, (SELECT id FROM usuarios WHERE email = $3))`,
    [torneoId, organizador.email, arbitro.email]
  );
  const cookieOrganizador = await login(baseUrl, organizador.email, organizador.password);
  const cookieArbitro = await login(baseUrl, arbitro.email, arbitro.password);

  let sancionJugadorId;
  let sancionEquipoId;

  t.after(async () => {
    server.close();
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('el árbitro NO puede ver ni crear sanciones de disciplina', async () => {
    const r1 = await fetch(`${baseUrl}/sanciones/disciplina/jugador?torneo_id=${torneoId}`, { headers: conCookie(cookieArbitro) });
    assert.equal(r1.status, 403);
    const r2 = await fetch(`${baseUrl}/sanciones/disciplina/jugador`, {
      method: 'POST', headers: conCookie(cookieArbitro),
      body: JSON.stringify({ jugador_id: jugadorId, motivo: 'x', fechas: 1 })
    });
    assert.equal(r2.status, 403);
  });

  await t.test('el organizador suspende al jugador por 1 fecha (sin multa)', async () => {
    const r = await fetch(`${baseUrl}/sanciones/disciplina/jugador`, {
      method: 'POST', headers: conCookie(cookieOrganizador),
      body: JSON.stringify({ jugador_id: jugadorId, motivo: 'Conducta extradeportiva', fechas: 1, multa: 0 })
    });
    assert.equal(r.status, 201);
    sancionJugadorId = (await r.json()).id;
  });

  await t.test('el jugador queda bloqueado en el próximo partido pendiente de su equipo', async () => {
    const r = await fetch(`${baseUrl}/sanciones/disciplina/jugador?torneo_id=${torneoId}`, { headers: conCookie(cookieOrganizador) });
    const data = await r.json();
    const s = data.find((x) => x.id === sancionJugadorId);
    assert.deepEqual(s.partidosBloqueadosIds, [partido1Id]);
    assert.equal(s.proximaFechaBloqueada, 1);
  });

  await t.test('el equipo NO queda bloqueado (sin multa) y puede iniciar el partido con otro jugador', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partido1Id}/iniciar`, { method: 'POST', headers: conCookie(cookieArbitro) });
    const data = await r.json();
    assert.doesNotMatch(data.error || '', /multa/i);
  });

  await t.test('el segundo partido (fuera del rango de fechas) no está bloqueado para el jugador', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partido2Id}`, { headers: conCookie(cookieArbitro) });
    const data = await r.json();
    const enLocal = data.convocadosLocal.find((j) => j.id === jugadorId);
    const enVisitante = data.convocadosVisitante.find((j) => j.id === jugadorId);
    const jugador = enLocal || enVisitante;
    assert.equal(jugador.suspendido, false);
  });

  await t.test('el organizador sanciona económicamente al jugador (multa) y bloquea al equipo', async () => {
    const r = await fetch(`${baseUrl}/sanciones/disciplina/jugador`, {
      method: 'POST', headers: conCookie(cookieOrganizador),
      body: JSON.stringify({ jugador_id: jugadorId, motivo: 'Multa extra', fechas: 0, multa: 50000 })
    });
    assert.equal(r.status, 201);
    const nuevaId = (await r.json()).id;

    const rIniciar = await fetch(`${baseUrl}/planilla/${partido2Id}/iniciar`, { method: 'POST', headers: conCookie(cookieArbitro) });
    const dataIniciar = await rIniciar.json();
    assert.equal(rIniciar.status, 400);
    assert.match(dataIniciar.error, /multa/i);

    const rPago = await fetch(`${baseUrl}/sanciones/disciplina/jugador/${nuevaId}/pagar`, { method: 'POST', headers: conCookie(cookieOrganizador) });
    assert.equal(rPago.status, 200);
  });

  await t.test('sanción económica directa a un equipo lo bloquea hasta que se pague', async () => {
    const r = await fetch(`${baseUrl}/sanciones/disciplina/equipo`, {
      method: 'POST', headers: conCookie(cookieOrganizador),
      body: JSON.stringify({ equipo_id: equipoAId, motivo: 'Incidentes con la hinchada', multa: 100000 })
    });
    assert.equal(r.status, 201);
    sancionEquipoId = (await r.json()).id;

    const rIniciar = await fetch(`${baseUrl}/planilla/${partido2Id}/iniciar`, { method: 'POST', headers: conCookie(cookieArbitro) });
    assert.equal(rIniciar.status, 400);

    const rPago = await fetch(`${baseUrl}/sanciones/disciplina/equipo/${sancionEquipoId}/pagar`, { method: 'POST', headers: conCookie(cookieOrganizador) });
    assert.equal(rPago.status, 200);
  });

  await t.test('expulsar un equipo de oficio (sin pasar por 2 walkovers) lo descalifica y da por perdidos sus pendientes', async () => {
    const r = await fetch(`${baseUrl}/equipos/${equipoAId}/baja`, {
      method: 'PATCH', headers: conCookie(cookieOrganizador),
      body: JSON.stringify({ tipo: 'descalificado', motivo: 'Agresión colectiva a un árbitro' })
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.ok, true);

    const { rows } = await pool.query('SELECT estado_torneo FROM equipos WHERE id = $1', [equipoAId]);
    assert.equal(rows[0].estado_torneo, 'descalificado');
  });
});
