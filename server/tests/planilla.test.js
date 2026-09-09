const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, slugDePrueba, limpiarDatosDePrueba, pool } = require('./setup');

// Microfútbol de propósito: no exige armar alineación titular/suplente antes de
// arrancar, así la prueba puede ir directo a lo que importa (cronómetro, gol,
// marcador) sin todo el paso previo de convocatoria.
async function armarPartidoListo() {
  const { rows: [t] } = await pool.query(
    `INSERT INTO torneos (nombre, slug, modalidad, formato, fixture_generado) VALUES ('Test', $1, 'microfutbol', 'liga', true) RETURNING id`,
    [slugDePrueba('planilla')]
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

test('planilla en vivo', async (t) => {
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

  await t.test('no se puede iniciar sin que los dos equipos estén confirmados', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 400);
  });

  await t.test('no se puede confirmar un equipo sin que su delegado haya firmado', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/confirmar-equipo`, {
      method: 'POST', headers: conCookie(cookie), body: JSON.stringify({ lado: 'local' })
    });
    assert.equal(r.status, 400);
  });

  await t.test('el delegado local firma la planilla antes de iniciar el partido', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/firma-delegado`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ lado: 'local', firma: 'data:image/png;base64,abc', firmante_nombre: 'Delegado A' })
    });
    assert.equal(r.status, 200);
    const partido = await r.json();
    assert.equal(partido.firma_delegado_local, 'data:image/png;base64,abc');
    assert.equal(partido.firmante_delegado_local, 'Delegado A');
  });

  await t.test('el mismo delegado no puede volver a firmar', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/firma-delegado`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ lado: 'local', firma: 'data:image/png;base64,def', firmante_nombre: 'Otro' })
    });
    assert.equal(r.status, 400);
  });

  await t.test('ya con la firma, el equipo local se puede confirmar', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/confirmar-equipo`, {
      method: 'POST', headers: conCookie(cookie), body: JSON.stringify({ lado: 'local' })
    });
    assert.equal(r.status, 200);
    const partido = await r.json();
    assert.equal(partido.confirmado_local, true);
    assert.equal(partido.confirmado_visitante, false);
  });

  await t.test('sigue sin poder iniciar porque falta confirmar al visitante', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 400);
  });

  await t.test('el delegado visitante firma y confirma su equipo por separado', async () => {
    const rFirma = await fetch(`${baseUrl}/planilla/${partidoId}/firma-delegado`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ lado: 'visitante', firma: 'data:image/png;base64,ghi', firmante_nombre: 'Delegado B' })
    });
    assert.equal(rFirma.status, 200);
    const conFirma = await rFirma.json();
    assert.equal(conFirma.firma_delegado_local, 'data:image/png;base64,abc', 'la firma del local sigue intacta');

    const rConfirmar = await fetch(`${baseUrl}/planilla/${partidoId}/confirmar-equipo`, {
      method: 'POST', headers: conCookie(cookie), body: JSON.stringify({ lado: 'visitante' })
    });
    assert.equal(rConfirmar.status, 200);
    const partido = await rConfirmar.json();
    assert.equal(partido.confirmado_local, true);
    assert.equal(partido.confirmado_visitante, true);
  });

  await t.test('iniciar pone el partido en curso con marcador 0-0', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/iniciar`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.estado, 'en_curso');
    assert.equal(data.goles_local, 0);
  });

  await t.test('arrancar el primer tiempo dispara el hito "inicio del partido" en el minuto 1', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/cronometro/iniciar-tiempo`, { method: 'POST', headers: conCookie(cookie) });
    assert.equal(r.status, 200);
    const { rows } = await pool.query(`SELECT tipo, minuto FROM partido_hitos WHERE partido_id = $1`, [partidoId]);
    assert.equal(rows[0].tipo, 'inicio_partido');
    assert.equal(rows[0].minuto, 1, 'el partido arranca en el minuto 1, nunca en el 0');
  });

  await t.test('un gol al segundo 150 (2:30) del cronómetro queda anotado en el minuto 3', async () => {
    // Deja el cronómetro corriendo con exactamente 2:30 acumulados.
    await pool.query(`UPDATE partidos SET cronometro_acumulado_seg = 150, cronometro_inicio = now() WHERE id = $1`, [partidoId]);

    const r = await fetch(`${baseUrl}/planilla/${partidoId}/gol`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ jugador_id: jugadorId, en_propia_puerta: false })
    });
    assert.equal(r.status, 201);
    const gol = await r.json();
    assert.equal(gol.minuto, 3, '2:30 corresponde al minuto 3 (el minuto 1 va de 0:00 a 0:59)');
  });

  await t.test('el marcador ya subió a 1-0 y el gol aparece en el detalle público del partido', async () => {
    const r = await fetch(`${baseUrl}/publico/partidos/${partidoId}`);
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.partido.goles_local, 1);
    assert.equal(data.partido.estado, 'en_curso');
    assert.equal(data.goles.length, 1);
    assert.equal(data.goles[0].jugador_id, jugadorId);
  });

  await t.test('ya en curso, no se puede volver a firmar (la firma es solo antes de iniciar)', async () => {
    const r = await fetch(`${baseUrl}/planilla/${partidoId}/firma-delegado`, {
      method: 'POST', headers: conCookie(cookie),
      body: JSON.stringify({ lado: 'local', firma: 'data:image/png;base64,def', firmante_nombre: 'Otro' })
    });
    assert.equal(r.status, 400);
  });
});
