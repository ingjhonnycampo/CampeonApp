const ETIQUETAS = {
  no_iniciado: 'Próximamente',
  proximamente: 'Próximamente',
  en_curso: 'En curso',
  finalizado: 'Finalizado'
};

export default function EstadoCampeonato({ estado }) {
  if (!estado || estado === 'sin_definir') return null;
  return <span className={'campeonato-estado campeonato-estado--' + estado}>{ETIQUETAS[estado]}</span>;
}
