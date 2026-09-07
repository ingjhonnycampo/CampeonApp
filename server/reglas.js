function calcularEdad(fechaNacimiento, fechaReferencia) {
  const nacimiento = new Date(fechaNacimiento);
  const referencia = new Date(fechaReferencia);
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const meses = referencia.getMonth() - nacimiento.getMonth();
  if (meses < 0 || (meses === 0 && referencia.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

// Valida la planilla de jugadores contra las reglas de edad de ambito 'planilla'.
// Devuelve null si todo cumple, o un mensaje de error describiendo la primera regla incumplida.
function validarReglasPlanilla(jugadores, reglas, fechaReferencia) {
  const reglasPlanilla = reglas.filter((r) => r.ambito === 'planilla');

  for (const regla of reglasPlanilla) {
    const cumplen = jugadores.filter((j) => {
      if (!j.fecha_nacimiento) return false;
      return calcularEdad(j.fecha_nacimiento, fechaReferencia) >= regla.edad_minima;
    }).length;

    if (cumplen < regla.cantidad_minima) {
      return regla.descripcion ||
        `La planilla necesita al menos ${regla.cantidad_minima} jugador(es) de ${regla.edad_minima} años o más (hay ${cumplen}).`;
    }
  }

  return null;
}

module.exports = { calcularEdad, validarReglasPlanilla };
