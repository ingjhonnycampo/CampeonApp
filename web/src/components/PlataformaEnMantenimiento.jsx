import { Link } from 'react-router-dom';
import PieFirma from './PieFirma';

export default function PlataformaEnMantenimiento() {
  return (
    <div className="bienvenida-page">
      <div className="bienvenida-hero">
        <img src="/logo.png" alt="CampeonApp" className="bienvenida-logo" />
        <span className="login-eyebrow">CampeonApp</span>
        <h1>Estamos en mantenimiento</h1>
        <p className="bienvenida-sub">La plataforma no está disponible por ahora. Vuelve a intentarlo en unos minutos.</p>
        <Link to="/login" className="publico-link">Acceso administrador</Link>
      </div>
      <PieFirma />
    </div>
  );
}
