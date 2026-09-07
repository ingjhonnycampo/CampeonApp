import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

const TITULOS = {
  admin: 'Panel de administración',
  arbitro: 'Panel de árbitro/anotador',
  delegado: 'Panel de delegado de equipo'
};

export default function DashboardPlaceholder() {
  const { usuario, logout } = useAuth();
  const modal = useModal();

  async function cerrarSesion() {
    const confirmado = await modal.confirmar({ titulo: '¿Cerrar sesión?', textoAceptar: 'Cerrar sesión' });
    if (confirmado) logout();
  }

  return (
    <div className="dashboard-placeholder">
      <header>
        <div className="dashboard-brand">
          <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
          <div>
            <span className="login-eyebrow">CampeonApp</span>
            <h1>{TITULOS[usuario.rol]}</h1>
          </div>
        </div>
        <button onClick={cerrarSesion}>Cerrar sesión</button>
      </header>
      <p>Hola, {usuario.nombre}. Esta pantalla se completa en el próximo módulo.</p>
    </div>
  );
}
