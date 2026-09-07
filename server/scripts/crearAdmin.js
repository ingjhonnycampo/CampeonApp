require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const [, , nombre, email, password] = process.argv;
  if (!nombre || !email || !password) {
    console.log('Uso: node server/scripts/crearAdmin.js "Nombre Apellido" correo@ejemplo.com contraseña');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, 'admin') RETURNING id, nombre, email, rol`,
    [nombre, email, password_hash]
  );
  console.log('Administrador creado:', rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
