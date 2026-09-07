export const NOMBRE_MODALIDAD = {
  futbol: 'Fútbol',
  futbol9: 'Fútbol 9',
  futbol7: 'Fútbol 7',
  microfutbol: 'Microfútbol',
  futbolsala: 'Fútbol Sala'
};

export function nombreModalidad(modalidad) {
  return NOMBRE_MODALIDAD[modalidad] || modalidad;
}

// Mismas reglas que el servidor (server/modalidades.js): cuántos titulares como
// máximo, si se lleva alineación formal con control de cambios (el que sale no
// vuelve a entrar) o si es de banca libre, y si se usa la tarjeta azul.
export const REGLAS_MODALIDAD = {
  futbol: { maxTitulares: 11, alineacionFormal: true, tarjetaAzul: false },
  futbol9: { maxTitulares: 9, alineacionFormal: true, tarjetaAzul: false },
  futbol7: { maxTitulares: 7, alineacionFormal: true, tarjetaAzul: false },
  microfutbol: { maxTitulares: 5, alineacionFormal: false, tarjetaAzul: true },
  futbolsala: { maxTitulares: 5, alineacionFormal: false, tarjetaAzul: true }
};

export function maxTitulares(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.maxTitulares ?? null;
}

export function usaAlineacionFormal(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.alineacionFormal ?? true;
}

export function permiteTarjetaAzul(modalidad) {
  return REGLAS_MODALIDAD[modalidad]?.tarjetaAzul ?? false;
}
