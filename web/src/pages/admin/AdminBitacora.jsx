import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import PieFirma from '../../components/PieFirma';
import PanelHeader from '../../components/PanelHeader';

export default function AdminBitacora() {
  const [torneos, setTorneos] = useState([]);
  const [torneoId, setTorneoId] = useState('');
  const [registros, setRegistros] = useState([]);

  useEffect(() => {
    api('/torneos').then(setTorneos);
  }, []);

  useEffect(() => {
    cargar();
  }, [torneoId]);

  async function cargar() {
    const query = torneoId ? `?torneo_id=${torneoId}` : '';
    setRegistros(await api('/bitacora' + query));
  }

  return (
    <div className="admin-panel">
      <PanelHeader titulo="Bitácora" volverA="/admin" />

      <section className="admin-card">
        <h2>Actividad reciente</h2>
        <div className="admin-form-linea">
          <select value={torneoId} onChange={(e) => setTorneoId(e.target.value)}>
            <option value="">Todos los campeonatos</option>
            {torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>

        {registros.length === 0 && <p className="admin-empty">Todavía no hay actividad registrada.</p>}

        <div className="admin-list admin-list--alta">
          {registros.map((r) => (
            <div key={r.id} className="admin-partido-fila" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>{r.accion}</strong>
                <br />
                <small className="admin-ayuda" style={{ margin: 0 }}>
                  {r.usuario_nombre || 'Sistema'}{r.torneo_nombre ? ` · ${r.torneo_nombre}` : ''} · {new Date(r.creado_en).toLocaleString('es-CO')}
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <PieFirma />
    </div>
  );
}
