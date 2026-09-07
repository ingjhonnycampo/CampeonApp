export function calcularEdad(fechaNacimiento, fechaReferencia) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  const referencia = new Date(fechaReferencia);
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const meses = referencia.getMonth() - nacimiento.getMonth();
  if (meses < 0 || (meses === 0 && referencia.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

// Un jugador "cuenta" para alguna condición de edad de la planilla -> su dato de nacimiento
// necesita quedar validado por el admin antes de que el equipo quede habilitado para participar.
export function jugadorRequiereValidacion(jugador, reglasPlanilla, fechaReferencia) {
  return (reglasPlanilla || []).some((r) => {
    const edad = calcularEdad(jugador.fecha_nacimiento, fechaReferencia);
    return edad !== null && edad >= r.edad_minima;
  });
}
