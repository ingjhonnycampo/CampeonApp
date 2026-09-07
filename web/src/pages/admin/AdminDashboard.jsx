import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import PieFirma from '../../components/PieFirma';

const SECCIONES = [
  {
    to: '/admin/campeonatos',
    titulo: 'Campeonatos',
    descripcion: 'Crear campeonatos, revisar inscripciones y validar edades.',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 3h12v4a6 6 0 0 1-12 0V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M6 4H3v2a3 3 0 0 0 3 3M18 4h3v2a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 13v4M9 21h6M9 19h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/admin/fixture',
    titulo: 'Fixture',
    descripcion: 'Configurar el formato del campeonato, generar el fixture o los grupos, y ver el cuadro eliminatorio.',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4.5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9.5h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 13.5h3M7 17h3M14 13.5h3M14 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/arbitro',
    titulo: 'Planillas',
    descripcion: 'Armar alineación, llevar la planilla en vivo de un partido, y ver o descargar el informe de los ya jugados.',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="17" cy="17.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 17.5l.8.8L18.4 16.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: '/admin/disciplina',
    titulo: 'Disciplina',
    descripcion: 'Sanciones de oficio a jugadores o equipos por conductas extradeportivas, y expulsiones de equipos del campeonato.',
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.5 12l2 2 3.5-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    to: '/admin/usuarios',
    titulo: 'Usuarios',
    descripcion: 'Cuentas de administradores y árbitros, y a qué campeonatos tienen acceso.',
    soloAdmin: true,
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="17" cy="8.5" r="2.3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/admin/bitacora',
    titulo: 'Bitácora',
    descripcion: 'Registro de lo que se ha hecho en la plataforma: campeonatos, equipos, jugadores, resultados y usuarios.',
    soloAdmin: true,
    icono: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 3h12a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
];

export default function AdminDashboard() {
  const { usuario, logout } = useAuth();
  const modal = useModal();

  async function cerrarSesion() {
    const confirmado = await modal.confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Vas a salir del panel de administración.',
      textoAceptar: 'Cerrar sesión'
    });
    if (confirmado) logout();
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="dashboard-brand">
          <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
          <div>
            <span className="login-eyebrow">CampeonApp</span>
            <h1>Panel de administración</h1>
          </div>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{usuario.nombre}</span>
          <button onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </header>

      <div className="admin-secciones">
        {SECCIONES.filter((s) => !s.soloAdmin || usuario.rol === 'admin').map((s) => (
          <Link key={s.to} to={s.to} className="admin-seccion-card">
            <span className="admin-seccion-icono">{s.icono}</span>
            <strong>{s.titulo}</strong>
            <p>{s.descripcion}</p>
          </Link>
        ))}
      </div>

      <PieFirma />
    </div>
  );
}
