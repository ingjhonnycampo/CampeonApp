import { useEffect, useState } from 'react';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { calcularEstadoCampeonato } from '../../lib/estadoCampeonato';
import PieFirma from '../../components/PieFirma';
import PanelHeader from '../../components/PanelHeader';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import { SeccionDisciplina, SeccionSanciones } from './SeccionFases';

export default function AdminDisciplina() {
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

  const torneo = torneos.find((t) => t.id === torneoActivoId);

  return (
    <div className="admin-panel">
      <PanelHeader titulo="Disciplina" volverA="/admin" />

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
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="admin-fixture-stack">
          <SeccionSanciones torneoId={torneo?.id} />
          <SeccionDisciplina torneoId={torneo?.id} />
        </div>
      </div>

      <PieFirma />
    </div>
  );
}
