import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import PieFirma from '../../components/PieFirma';
import SeccionUsuarios from './SeccionUsuarios';

export default function AdminUsuarios() {
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
            <Link to="/admin" className="admin-volver">← Panel</Link>
            <h1>Usuarios</h1>
          </div>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{usuario.nombre}</span>
          <button onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </header>

      <div className="admin-grid admin-grid--uno">
        <SeccionUsuarios />
      </div>

      <PieFirma />
    </div>
  );
}
