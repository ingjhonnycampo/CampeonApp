import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import PieFirma from '../../components/PieFirma';
import PanelHeader from '../../components/PanelHeader';

export default function AdminEstadisticasUso() {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    api('/estadisticas-uso').then(setDatos);
  }, []);

  if (!datos) {
    return (
      <div className="admin-panel">
        <PanelHeader titulo="Uso de la plataforma" volverA="/admin" />
        <p className="admin-empty">Cargando...</p>
      </div>
    );
  }

  const maxPorDia = Math.max(1, ...datos.porDia.map((d) => d.cantidad));

  return (
    <div className="admin-panel">
      <PanelHeader titulo="Uso de la plataforma" volverA="/admin" />

      <div className="admin-metricas">
        <div className="admin-metrica">
          <strong>{datos.total}</strong>
          <span>Visitas totales</span>
        </div>
        <div className="admin-metrica">
          <strong>{datos.ultimos7dias}</strong>
          <span>Últimos 7 días</span>
        </div>
        <div className="admin-metrica">
          <strong>{datos.ultimos30dias}</strong>
          <span>Últimos 30 días</span>
        </div>
      </div>

      <section className="admin-card">
        <h2>Visitas por día (últimos 30 días)</h2>
        {datos.porDia.length === 0 && <p className="admin-empty">Todavía no hay visitas registradas.</p>}
        {datos.porDia.length > 0 && (
          <div className="admin-barras">
            {datos.porDia.map((d) => (
              <div key={d.fecha} className="admin-barra-col" title={`${d.cantidad} visitas`}>
                <span className="admin-barra" style={{ height: `${(d.cantidad / maxPorDia) * 100}%` }} />
                <small>{new Date(d.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="admin-grid admin-grid--dos">
        <section className="admin-card">
          <h2>Por tipo de pantalla</h2>
          {datos.porRuta.length === 0 && <p className="admin-empty">Sin datos todavía.</p>}
          <div className="admin-list admin-list--alta">
            {datos.porRuta.map((r) => (
              <div key={r.ruta} className="admin-partido-fila" style={{ justifyContent: 'space-between' }}>
                <span>{r.etiqueta}</span>
                <strong>{r.cantidad}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <h2>Campeonatos más visitados</h2>
          {datos.porCampeonato.length === 0 && <p className="admin-empty">Todavía no hay visitas asociadas a un campeonato.</p>}
          <div className="admin-list admin-list--alta">
            {datos.porCampeonato.map((c) => (
              <div key={c.torneoId} className="admin-partido-fila" style={{ justifyContent: 'space-between' }}>
                <span>{c.torneoNombre}</span>
                <strong>{c.cantidad}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <PieFirma />
    </div>
  );
}
