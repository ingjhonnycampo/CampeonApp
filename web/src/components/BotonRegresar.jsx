import { Link, useNavigate } from 'react-router-dom';

export default function BotonRegresar({ to }) {
  const navigate = useNavigate();

  if (to) {
    return <Link to={to} className="boton-regresar">← Volver</Link>;
  }

  return (
    <button type="button" className="boton-regresar" onClick={() => navigate(-1)}>← Volver</button>
  );
}
