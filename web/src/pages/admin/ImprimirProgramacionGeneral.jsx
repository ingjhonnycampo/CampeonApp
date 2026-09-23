import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

const ETIQUETA_GENERO = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' };

function fechaLocalISO(fecha) {
  const d = new Date(fecha);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

async function partidosDeTorneo(torneo) {
  let partidos = [];
  if (torneo.formato === 'liga') {
    partidos = await api('/partidos?torneo_id=' + torneo.id);
  } else if (torneo.formato === 'grupos') {
    const fases = await api('/fases?torneo_id=' + torneo.id);
    for (const fase of fases) {
      const ps = await api(`/fases/${fase.id}/partidos`);
      partidos.push(...ps.map((p) => ({ ...p, _faseNombre: fase.tipo === 'grupos' ? 'Grupos' : (p.ronda_nombre || 'Eliminatoria') })));
    }
  }
  return partidos
    .filter((p) => p.equipo_local_id && p.equipo_visitante_id)
    .map((p) => ({ ...p, _torneoNombre: torneo.nombre, _torneoGenero: torneo.genero }));
}

export default function ImprimirProgramacionGeneral() {
  const [dia, setDia] = useState(fechaLocalISO(new Date()));
  const [seleccionados, setSeleccionados] = useState(null);

  const { datos, cargando } = useCargaMinima(async () => {
    const torneos = (await api('/torneos')).filter((t) => t.fixture_generado);
    return { torneos };
  }, []);

  if (cargando || !datos) return <CargaJugador texto="Cargando los campeonatos..." />;

  const { torneos } = datos;
  const activos = seleccionados ?? new Set(torneos.map((t) => t.id));

  function alternar(id) {
    setSeleccionados((prev) => {
      const base = new Set(prev ?? torneos.map((t) => t.id));
      if (base.has(id)) base.delete(id); else base.add(id);
      return base;
    });
  }

  return (
    <ImprimirProgramacionGeneralConDatos
      torneos={torneos} activos={activos} onAlternar={alternar} dia={dia} setDia={setDia}
    />
  );
}

function ImprimirProgramacionGeneralConDatos({ torneos, activos, onAlternar, dia, setDia }) {
  const torneosElegidos = torneos.filter((t) => activos.has(t.id));

  const { datos, cargando } = useCargaMinima(async () => {
    const porTorneo = await Promise.all(torneosElegidos.map(partidosDeTorneo));
    return porTorneo.flat();
  }, [torneosElegidos.map((t) => t.id).join(',')]);

  const partidos = datos || [];
  const delDia = partidos
    .filter((p) => p.fecha_hora && fechaLocalISO(p.fecha_hora) === dia)
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

  const tituloDia = new Date(dia + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/fixture">← Volver al panel</Link>
        <label className="imprimir-selector-fecha">
          Día
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="imprimir-selector-campeonatos no-imprimir">
        <span>Campeonatos a incluir:</span>
        {torneos.map((t) => (
          <label key={t.id} className="imprimir-selector-campeonato-item">
            <input type="checkbox" checked={activos.has(t.id)} onChange={() => onAlternar(t.id)} />
            {t.nombre}{t.genero && ` (${ETIQUETA_GENERO[t.genero]})`}
          </label>
        ))}
        {torneos.length === 0 && <span className="admin-empty">No hay campeonatos con fixture generado.</span>}
      </div>

      <header className="imprimir-header">
        <div>
          <h1>Programación del día</h1>
          <p>{tituloDia}</p>
        </div>
      </header>

      {cargando && <CargaJugador texto="Cargando los partidos..." />}

      {!cargando && delDia.length === 0 && <p className="admin-empty">No hay partidos programados para esta fecha en los campeonatos elegidos.</p>}

      {!cargando && delDia.length > 0 && (
        <table className="imprimir-tabla">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Local</th>
              <th></th>
              <th>Visitante</th>
              <th>Campeonato</th>
              <th>Jornada</th>
            </tr>
          </thead>
          <tbody>
            {delDia.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.fecha_hora).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</td>
                <td>{p.equipo_local_nombre}</td>
                <td style={{ textAlign: 'center' }}>vs</td>
                <td>{p.equipo_visitante_nombre}</td>
                <td>
                  {p._torneoNombre}
                  {p._torneoGenero && ` (${ETIQUETA_GENERO[p._torneoGenero]})`}
                </td>
                <td>{p._faseNombre || `Fecha ${p.jornada}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="imprimir-pie">
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
