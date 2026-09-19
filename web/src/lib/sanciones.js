// Qué necesita un jugador sancionado por tarjeta para volver a estar disponible.
// `s` es una sanción activa tal como la devuelve el servidor (calcularSanciones):
// amarilla/azul -> solo pagar la multa; doble amarilla y roja directa -> además
// cumplir las fechas obligatorias de suspensión (configurables por campeonato).
export function restriccionSancion(s) {
  const fechas = s.partidosObligatorios || 0;
  const pendientes = s.partidosObligatoriosPendientes || 0;

  if (s.habilitado) {
    return `no disponible: le ${pendientes === 1 ? 'falta' : 'faltan'} ${pendientes} fecha${pendientes === 1 ? '' : 's'} de sanción (la multa ya está paga)`;
  }
  if (fechas > 0) {
    return `no disponible hasta pagar la multa y cumplir ${fechas} fecha${fechas === 1 ? '' : 's'} de sanción`;
  }
  return 'no disponible hasta pagar la multa';
}
