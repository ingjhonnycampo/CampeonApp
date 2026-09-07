import { Link } from 'react-router-dom';
import PieFirma from '../../components/PieFirma';

const OPCIONES = [
  {
    to: '/en-vivo',
    titulo: 'Ver en vivo',
    descripcion: 'Resultados, posiciones y goleadores de todos los campeonatos, al momento.',
    clase: 'bienvenida-opcion--vivo',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8.5l6 3.5-6 3.5v-7Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: '/inscripciones',
    titulo: 'Inscribe tu equipo',
    descripcion: 'Mira qué campeonatos tienen las inscripciones abiertas ahora mismo.',
    clase: 'bienvenida-opcion--inscribir',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 3h6v2a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.5 13.5l1.8 1.8L14.5 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: '/login',
    titulo: 'Ingresar',
    descripcion: 'Administradores, organizadores y árbitros — entra a tu panel.',
    clase: 'bienvenida-opcion--ingresar',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11.8 11.8L21 21M16.5 16.5l3-3M19 19l2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
];

export default function Bienvenida() {
  return (
    <div className="bienvenida-page">
      <div className="bienvenida-hero">
        <img src="/logo.png" alt="CampeonApp" className="bienvenida-logo" />
        <span className="login-eyebrow">CampeonApp</span>
        <h1>¿Qué quieres hacer?</h1>
        <p className="bienvenida-sub">Gestión de campeonatos de fútbol y microfútbol.</p>
      </div>

      <div className="bienvenida-opciones">
        {OPCIONES.map((o) => (
          <Link key={o.to} to={o.to} className={'bienvenida-opcion ' + o.clase}>
            <span className="bienvenida-opcion-icono">{o.icono}</span>
            <strong>{o.titulo}</strong>
            <p>{o.descripcion}</p>
          </Link>
        ))}
      </div>

      <PieFirma />
    </div>
  );
}
