import { useEffect, useState } from 'react';
import { nombreModalidad } from '../../lib/modalidad';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { api } from '../../lib/api';
import { calcularEstadoCampeonato } from '../../lib/estadoCampeonato';
import PieFirma from '../../components/PieFirma';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import SeccionFixture from './SeccionFixture';

export default function AdminFixture() {
  const { usuario, logout } = useAuth();
  const modal = useModal();
  const [torneos, setTorneos] = useState([]);
  const [torneoActivoId, setTorneoActivoId] = useState(null);

  useEffect(() => {
    cargarTorneos();
  }, []);

  async function cargarTorneos() {
    const data = await api('/torneos');
    setTorneos(data);
    setTorneoActivoId((actual) => actual ?? data[0]?.id);
  }

  async function alternarVisibilidadPublica(e, torneoId, ocultoActual) {
    e.stopPropagation();
    await api(`/torneos/${torneoId}/visibilidad-publica`, {
      method: 'PATCH',
      body: JSON.stringify({ oculto: !ocultoActual })
    });
    await cargarTorneos();
  }

  async function cerrarSesion() {
    const confirmado = await modal.confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Vas a salir del panel de administración.',
      textoAceptar: 'Cerrar sesión'
    });
    if (confirmado) logout();
  }

  const torneo = torneos.find((t) => t.id === torneoActivoId);

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="dashboard-brand">
          <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
          <div>
            <Link to="/admin" className="admin-volver">← Panel</Link>
            <h1>Fixture</h1>
          </div>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{usuario.nombre}</span>
          <button onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </header>

      <div className="admin-grid admin-grid--dos">
        <section className="admin-card">
          <h2>Campeonatos</h2>
          <div className="admin-list admin-list--alta">
            {torneos.length === 0 && <p className="admin-empty">Todavía no hay campeonatos.</p>}
            {torneos.map((t) => (
              <div
                key={t.id} role="button" tabIndex={0}
                className={'admin-item' + (t.id === torneoActivoId ? ' activo' : '')}
                onClick={() => setTorneoActivoId(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setTorneoActivoId(t.id); }}
              >
                {t.logo_url ? <img src={t.logo_url} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
                <span>
                  <strong>{t.nombre}</strong>
                  <small>{nombreModalidad(t.modalidad)}</small>
                </span>
                <span className="admin-item-derecha">
                  <EstadoCampeonato estado={calcularEstadoCampeonato(t)} />
                  {t.finalizado && (
                    <button
                      type="button" className="admin-toggle-publico"
                      onClick={(e) => alternarVisibilidadPublica(e, t.id, t.oculto_en_publico)}
                    >
                      {t.oculto_en_publico ? 'Oculto del público — mostrar' : 'Visible en el público — ocultar'}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <SeccionFixture torneo={torneo} onCambio={cargarTorneos} />
      </div>

      <PieFirma />
    </div>
  );
}
