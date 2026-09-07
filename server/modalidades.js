// Reglas de cada modalidad: cuántos titulares como máximo, si se lleva un
// control formal de alineación/cambios (con salida definitiva del jugador que
// sale) o si es de banca libre (entran y salen las veces que quieran, sin
// registrar cambios), y si se usa la tarjeta azul.
const REGLAS_MODALIDAD = {
  futbol: { maxTitulares: 11, alineacionFormal: true, tarjetaAzul: false },
  futbol9: { maxTitulares: 9, alineacionFormal: true, tarjetaAzul: false },
  futbol7: { maxTitulares: 7, alineacionFormal: true, tarjetaAzul: false },
  microfutbol: { maxTitulares: 5, alineacionFormal: false, tarjetaAzul: true },
  futbolsala: { maxTitulares: 5, alineacionFormal: false, tarjetaAzul: true }
};

const MODALIDADES_VALIDAS = Object.keys(REGLAS_MODALIDAD);

function maxTitulares(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.maxTitulares ?? null;
}

// Futbol/futbol9/futbol7: hay que armar alineación (titulares/suplentes) antes
// de arrancar, se controla quién está "en cancha" y un jugador que salió no
// puede volver a entrar. Microfútbol/fútbol sala: banca libre, sin ese control.
function usaAlineacionFormal(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.alineacionFormal ?? true;
}

function permiteTarjetaAzul(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.tarjetaAzul ?? false;
}

module.exports = { REGLAS_MODALIDAD, MODALIDADES_VALIDAS, maxTitulares, usaAlineacionFormal, permiteTarjetaAzul };
