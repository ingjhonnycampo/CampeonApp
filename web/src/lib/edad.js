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

// Edad del jugador si cumple alguna regla de edad (ej. "mínimo N jugadores de
// 35+ años en cancha") — para resaltarlo en la planilla del árbitro. Devuelve
// null si no aplica ninguna regla, así el llamador no muestra nada.
export function edadSiCumpleRegla(jugador, reglas, fechaReferencia) {
  const edad = calcularEdad(jugador.fecha_nacimiento, fechaReferencia);
  if (edad === null) return null;
  const cumple = (reglas || []).some((r) => edad >= r.edad_minima);
  return cumple ? edad : null;
}
