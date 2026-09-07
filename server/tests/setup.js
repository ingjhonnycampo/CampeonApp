// Utilidades compartidas por las pruebas: levanta la app Express en un puerto
// libre (no en el 3000, para no chocar con el servidor de desarrollo que ya está
// corriendo), y da helpers para armar peticiones autenticadas.
process.env.NODE_ENV = 'test'; // desactiva el rate limiting (ver server/middleware/rateLimit.js)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { app } = require('../index');

async function iniciarApp() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}/api` };
}

// Todos los datos que crean las pruebas usan este prefijo — así se identifican y
// se pueden borrar sin riesgo de tocar nada real, sin importar en qué orden
// terminen o si alguna prueba falla a la mitad.
const PREFIJO = 'auto-test';

function emailDePrueba(etiqueta) {
  return `${PREFIJO}-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@campeonapp.local`;
}

function slugDePrueba(etiqueta) {
  return `${PREFIJO}-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function crearUsuario({ nombre = 'Usuario Prueba', rol = 'admin', password = 'test1234' } = {}) {
  const email = emailDePrueba(rol);
  const hash = await bcrypt.hash(password, 10);
  const { rows: [u] } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id`,
    [nombre, email, hash, rol]
  );
  return { id: u.id, email, password };
}

// Hace login y devuelve el valor de la cookie de sesión, para pasarlo a fetch()
// en las siguientes peticiones (fetch nativo no trae "jar" de cookies solo).
async function login(baseUrl, email, password) {
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) throw new Error('login falló: ' + (await r.text()));
  const setCookie = r.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  return cookie;
}

function conCookie(cookie) {
  return { Cookie: cookie, 'Content-Type': 'application/json' };
}

// Borra TODO lo que hayan dejado las pruebas (por el prefijo), sin importar el
// torneo/usuario específico — se llama una vez al final de cada archivo de test.
async function limpiarDatosDePrueba() {
  await pool.query(`DELETE FROM torneos WHERE slug LIKE $1`, [`${PREFIJO}-%`]);
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`${PREFIJO}-%`]);
}

module.exports = { iniciarApp, crearUsuario, login, conCookie, emailDePrueba, slugDePrueba, limpiarDatosDePrueba, pool };
