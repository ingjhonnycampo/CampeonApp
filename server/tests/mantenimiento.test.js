// Prueba del modo mantenimiento SIN tocar la configuración real (la base de
// pruebas es la misma de producción: apagar la plataforma de verdad, aunque sea
// unos segundos, dejaría el sitio caído para el público). Se simula la consulta.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const pool = require('../db');

let disponible = false;
pool.query = async () => ({ rows: [{ plataforma_disponible: disponible }] });
const { verificarDisponibilidad, invalidarCache } = require('../middleware/mantenimiento');

function correr(url, cookies = {}) {
  return new Promise((resolve) => {
    const res = { status(c) { this.codigo = c; return this; }, json(b) { resolve({ codigo: this.codigo, cuerpo: b }); } };
    verificarDisponibilidad({ originalUrl: url, cookies }, res, () => resolve({ codigo: 200 }));
  });
}

test('modo mantenimiento', async (t) => {
  await t.test('apagada: el público recibe 503 con aviso de mantenimiento', async () => {
    disponible = false; invalidarCache();
    const r = await correr('/api/publico/torneos');
    assert.equal(r.codigo, 503);
    assert.equal(r.cuerpo.mantenimiento, true);
  });
  await t.test('apagada: un usuario que no es admin también se bloquea', async () => {
    const sesion = jwt.sign({ id: 5, rol: 'arbitro' }, process.env.JWT_SECRET);
    assert.equal((await correr('/api/planilla/1', { sesion })).codigo, 503);
  });
  await t.test('apagada: el admin sigue entrando', async () => {
    const sesion = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET);
    assert.equal((await correr('/api/torneos', { sesion })).codigo, 200);
  });
  await t.test('apagada: login, configuración y salud siguen abiertos', async () => {
    for (const ruta of ['/api/auth/login', '/api/configuracion', '/api/salud']) {
      assert.equal((await correr(ruta)).codigo, 200, ruta);
    }
  });
  await t.test('encendida: todos pasan', async () => {
    disponible = true; invalidarCache();
    assert.equal((await correr('/api/publico/torneos')).codigo, 200);
  });
});
