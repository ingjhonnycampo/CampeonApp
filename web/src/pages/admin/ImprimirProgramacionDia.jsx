import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

function fechaLocalISO(fecha) {
  const d = new Date(fecha);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export default function ImprimirProgramacionDia() {
  const { torneoId } = useParams();
  const [dia, setDia] = useState(fechaLocalISO(new Date()));

  const { datos, cargando } = useCargaMinima(async () => {
    const torneo = await api('/torneos/' + torneoId);

    let partidos = [];
    if (torneo.formato === 'liga') {
      partidos = await api('/partidos?torneo_id=' + torneoId);
    } else {
      const fases = await api('/fases?torneo_id=' + torneoId);
      for (const fase of fases) {
        const ps = await api(`/fases/${fase.id}/partidos`);
        partidos.push(...ps.map((p) => ({ ...p, _faseNombre: fase.tipo === 'grupos' ? 'Grupos' : (p.ronda_nombre || 'Eliminatoria') })));
      }
    }
    partidos = partidos.filter((p) => p.equipo_local_id && p.equipo_visitante_id);

    return { torneo, partidos };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando la programación..." />;

  const { torneo, partidos } = datos;
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
          Programación del día
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>{torneo.nombre}</h1>
          <p>Programación del {tituloDia} — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      {delDia.length === 0 && <p className="admin-empty">No hay partidos programados para esta fecha.</p>}

      {delDia.length > 0 && (
        <table className="imprimir-tabla">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Local</th>
              <th></th>
              <th>Visitante</th>
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
                <td>{p._faseNombre || `Fecha ${p.jornada}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
