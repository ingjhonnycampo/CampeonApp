export function calcularEstadoCampeonato(torneo) {
  // Si ya sabemos que se jugó de verdad el último partido (el dato real que manda
  // el servidor), eso pesa más que cualquier fecha — un campeonato no "termina"
  // solo porque pasó la fecha si todavía faltan partidos por jugar.
  if (torneo.finalizado) return 'finalizado';

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (torneo.fecha_inicio && hoy < new Date(torneo.fecha_inicio)) return 'no_iniciado';
  if (torneo.fecha_inicio || torneo.fecha_fin) return 'en_curso';
  return 'sin_definir';
}
