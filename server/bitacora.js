// Deja un registro legible en la bitácora. Nunca debe tumbar la operación
// principal si falla, así que se traga cualquier error de la propia bitácora.
async function registrar(pool, { torneoId = null, usuarioId = null, accion }) {
  try {
    await pool.query(
      'INSERT INTO bitacora (torneo_id, usuario_id, accion) VALUES ($1, $2, $3)',
      [torneoId, usuarioId, accion]
    );
  } catch (err) {
    console.error('No se pudo registrar en la bitácora:', err.message);
  }
}

module.exports = { registrar };
