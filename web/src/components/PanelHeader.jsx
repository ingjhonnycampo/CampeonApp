import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

const ETIQUETA_ROL = {
  admin: 'Administrador',
  organizador: 'Organizador',
  arbitro: 'Árbitro/Anotador',
  delegado: 'Delegado'
};

// Encabezado compartido de todas las pantallas del panel (admin y árbitro): logo,
// título, y a la derecha quién está conectado (con su rol) y el botón de salir.
// Antes cada pantalla repetía este bloque a mano — quedaba desalineado en
// celular porque el nombre largo del usuario chocaba con el título.
export default function PanelHeader({ titulo, eyebrow, volverA, volverTexto = '← Panel' }) {
  const { usuario, logout } = useAuth();
  const modal = useModal();

  async function cerrarSesion() {
    const confirmado = await modal.confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Vas a salir del panel.',
      textoAceptar: 'Cerrar sesión'
    });
    if (confirmado) logout();
  }

  return (
    <header className="admin-header">
      <div className="dashboard-brand">
        <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
        <div>
          {eyebrow && <span className="login-eyebrow">CampeonApp</span>}
          {volverA && <Link to={volverA} className="admin-volver">{volverTexto}</Link>}
          <h1>{titulo}</h1>
        </div>
      </div>
      <div className="admin-header-right">
        <span className="admin-user">
          {usuario.nombre}
          <span className="admin-user-rol">{ETIQUETA_ROL[usuario.rol] || usuario.rol}</span>
        </span>
        <button onClick={cerrarSesion}>Cerrar sesión</button>
      </div>
    </header>
  );
}
