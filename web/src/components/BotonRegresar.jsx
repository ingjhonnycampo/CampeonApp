import { Link, useNavigate } from 'react-router-dom';

// Sin "to", intenta volver a la página anterior del historial — pero eso no
// sirve de nada si esta fue la primera pantalla de la sesión (ej. alguien abre
// un enlace de inscripción directo desde WhatsApp, o la app instalada arranca
// justo acá): en ese caso no hay a dónde "volver" y el botón se quedaría sin
// hacer nada. Por eso, si no hay historial real, cae a la pantalla de inicio.
export default function BotonRegresar({ to }) {
  const navigate = useNavigate();

  if (to) {
    return <Link to={to} className="boton-regresar">← Volver</Link>;
  }

  function irAtras() {
    if (window.history.length > 2) navigate(-1);
    else navigate('/');
  }

  return (
    <button type="button" className="boton-regresar" onClick={irAtras}>← Volver</button>
  );
}
