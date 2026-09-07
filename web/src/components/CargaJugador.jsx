export default function CargaJugador({ texto = 'Cargando...' }) {
  return (
    <div className="carga-pagina">
      <svg className="carga-svg" viewBox="0 0 100 110" width="110" height="121">
        <ellipse className="carga-sombra" cx="50" cy="100" rx="18" ry="5" />
        <g className="carga-balon-grupo">
          <circle className="carga-balon" cx="50" cy="0" r="8" />
          <path d="M46 -4 L54 -4 L57 0 L54 4 L46 4 L43 0 Z" className="carga-balon-parche" />
        </g>
        <circle className="carga-cabeza" cx="50" cy="24" r="10" />
        <line className="carga-cuerpo" x1="50" y1="34" x2="47" y2="62" />
        <line className="carga-brazo" x1="48" y1="40" x2="36" y2="50" />
        <line className="carga-brazo" x1="49" y1="42" x2="60" y2="36" />
        <line className="carga-pierna-fija" x1="47" y1="62" x2="40" y2="92" />
        <g className="carga-pierna-movil-grupo">
          <line className="carga-pierna-movil" x1="47" y1="62" x2="60" y2="82" />
        </g>
      </svg>
      <span className="carga-texto">{texto}</span>
    </div>
  );
}
