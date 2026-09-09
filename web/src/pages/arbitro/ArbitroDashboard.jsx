import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import PanelHeader from '../../components/PanelHeader';

const ETIQUETA_ESTADO = {
  programado: 'Sin empezar',
  reprogramado: 'Reprogramado',
  en_curso: 'En curso',
  jugado: 'Jugado'
};

export default function ArbitroDashboard() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [torneos, setTorneos] = useState([]);
  const [torneoId, setTorneoId] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api('/torneos').then((data) => {
      setTorneos(data);
      setTorneoId((actual) => actual ?? data[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (torneoId) cargarPartidos(torneoId);
  }, [torneoId]);

  async function cargarPartidos(id) {
    setCargando(true);
    try {
      const torneo = torneos.find((t) => t.id === id) || await api('/torneos/' + id);
      const lista = [];

      if (torneo.formato === 'liga') {
        const liga = await api('/partidos?torneo_id=' + id);
        lista.push(...liga.map((p) => ({ ...p, contexto: 'Liga' })));
      }

      const fases = await api('/fases?torneo_id=' + id);
      for (const fase of fases) {
        const ps = await api(`/fases/${fase.id}/partidos`);
        lista.push(...ps.map((p) => ({ ...p, contexto: fase.tipo === 'grupos' ? 'Grupos' : (p.ronda_nombre || 'Eliminatoria') })));
      }

      lista.sort((a, b) => (a.jornada - b.jornada) || (a.id - b.id));
      setPartidos(lista);
    } finally {
      setCargando(false);
    }
  }

  const esArbitro = usuario.rol === 'arbitro';
  const puedeVolverAlAdmin = usuario.rol === 'admin' || usuario.rol === 'organizador';
  const hoy = new Date().toDateString();
  const esHoy = (p) => p.fecha_hora && new Date(p.fecha_hora).toDateString() === hoy;

  const pendientes = partidos.filter((p) => (
    p.estado !== 'jugado' && p.equipo_local_id && p.equipo_visitante_id &&
    (!esArbitro || p.estado === 'en_curso' || esHoy(p))
  ));
  const jugados = partidos.filter((p) => p.estado === 'jugado');

  return (
    <div className="dashboard-placeholder">
      <PanelHeader
        titulo="Panel de árbitro/anotador"
        eyebrow
        volverA={puedeVolverAlAdmin ? '/admin' : undefined}
        volverTexto="← Volver al menú"
      />

      <section className="admin-card">
        <label className="admin-label-ancho">Campeonato
          <select value={torneoId || ''} onChange={(e) => setTorneoId(Number(e.target.value))}>
            {torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        {torneos.length === 0 && <p className="admin-empty">No tienes campeonatos asignados todavía.</p>}
      </section>

      {cargando ? (
        <p className="admin-empty">Cargando partidos...</p>
      ) : (
        <>
          <section className="admin-card">
            <h2>Partidos por jugar{esArbitro ? ' hoy' : ''}</h2>
            <div className="admin-list admin-list--alta">
              {pendientes.length === 0 && (
                <p className="admin-empty">
                  {esArbitro ? 'No tienes partidos programados para hoy.' : 'No hay partidos pendientes con equipos ya definidos.'}
                </p>
              )}
              {pendientes.map((p) => (
                <button key={p.id} className="admin-item" onClick={() => navigate('/arbitro/planilla/' + p.id)}>
                  <span>
                    <strong>{p.equipo_local_nombre} vs {p.equipo_visitante_nombre}</strong>
                    <small>
                      {p.contexto} — Jornada {p.jornada}{p.llave ? ` — Llave ${p.llave}` : ''}
                      {p.fecha_hora ? ` — ${new Date(p.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}` : ' — Sin hora programada'}
                    </small>
                  </span>
                  <span className={'admin-estado admin-estado--' + (p.estado === 'en_curso' ? 'aprobado' : 'pendiente')}>
                    {ETIQUETA_ESTADO[p.estado] || p.estado}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="admin-card">
            <h2>Ya jugados</h2>
            <div className="admin-list admin-list--alta">
              {jugados.length === 0 && <p className="admin-empty">Todavía no hay partidos jugados.</p>}
              {jugados.map((p) => (
                <button key={p.id} className="admin-item" onClick={() => navigate('/arbitro/planilla/' + p.id)}>
                  <span>
                    <strong>{p.equipo_local_nombre} vs {p.equipo_visitante_nombre}</strong>
                    <small>{p.contexto} — Jornada {p.jornada}</small>
                  </span>
                  <span className="admin-estado admin-estado--aprobado">{p.goles_local} - {p.goles_visitante}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
