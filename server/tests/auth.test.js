const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, crearUsuario, login, conCookie, limpiarDatosDePrueba, pool } = require('./setup');

test('login', async (t) => {
  const { server, baseUrl } = await iniciarApp();
  const usuario = await crearUsuario({ rol: 'admin' });

  t.after(async () => {
    server.close();
    await limpiarDatosDePrueba();
    await pool.end();
  });

  await t.test('con credenciales correctas entra y /auth/yo reconoce la sesión', async () => {
    const cookie = await login(baseUrl, usuario.email, usuario.password);
    assert.ok(cookie.startsWith('sesion='), 'debería recibir la cookie de sesión');

    const r = await fetch(`${baseUrl}/auth/yo`, { headers: conCookie(cookie) });
    assert.equal(r.status, 200);
    const yo = await r.json();
    assert.equal(yo.rol, 'admin');
  });

  await t.test('con contraseña incorrecta rechaza con 401', async () => {
    const r = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: usuario.email, password: 'contraseña-mala' })
    });
    assert.equal(r.status, 401);
  });

  await t.test('sin cookie, /auth/yo rechaza con 401', async () => {
    const r = await fetch(`${baseUrl}/auth/yo`);
    assert.equal(r.status, 401);
  });
});
