function formatoReloj(totalSeg) {
  const seg = Math.max(0, totalSeg);
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Cronómetro de un tiempo en curso para las vistas públicas: se congela en la
// duración reglamentaria del torneo apenas se cumple, y de ahí en adelante
// muestra aparte, con "+", lo que va corrido de tiempo de adición.
export default function RelojConAdicion({ partido, totalSeg }) {
  const duracionMin = partido.tiempo_actual === 'segundo_tiempo' ? partido.duracion_tiempo_2 : partido.duracion_tiempo_1;
  const duracionSeg = (duracionMin || 0) * 60;
  const cumplido = duracionSeg > 0 && totalSeg >= duracionSeg;
  if (!cumplido) return formatoReloj(totalSeg);
  return `${formatoReloj(duracionSeg)} +${formatoReloj(totalSeg - duracionSeg)}`;
}
