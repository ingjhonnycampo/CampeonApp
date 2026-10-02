import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

export default function ImprimirResultados() {
  const { torneoId } = useParams();
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

    const jugados = partidos.filter((p) => p.estado === 'jugado');
    const porJornada = new Map();
    jugados.forEach((p) => {
      if (!porJornada.has(p.jornada)) porJornada.set(p.jornada, []);
      porJornada.get(p.jornada).push(p);
    });
    const jornadas = [...porJornada.keys()].sort((a, b) => a - b);

    return { torneo, porJornada, jornadas };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando los resultados..." />;

  const { torneo, porJornada, jornadas } = datos;

  function ganoLocal(p) { return p.goles_local > p.goles_visitante; }
  function ganoVisitante(p) { return p.goles_visitante > p.goles_local; }

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/fixture">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>{torneo.nombre}</h1>
          <p>Resultados por fecha — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      {jornadas.length === 0 && <p className="admin-empty">Todavía no hay partidos jugados.</p>}

      {jornadas.map((j) => {
        const partidosDeFecha = porJornada.get(j);
        return (
          <div key={j} style={{ marginBottom: '18px' }}>
            <h2>{partidosDeFecha[0]._faseNombre || `Fecha ${j}`}</h2>
            <div className="imprimir-jornada-lista">
              {partidosDeFecha.map((p) => {
                const fechaJugado = p.jugado_hasta || p.fecha_hora;
                return (
                  <div key={p.id} className="imprimir-partido-card">
                    <div className="imprimir-partido-equipo">
                      {p.equipo_local_escudo ? <img src={p.equipo_local_escudo} alt="" /> : <span className="imprimir-escudo-vacio" />}
                      <span className={ganoLocal(p) ? 'imprimir-equipo-gana' : ''}>{p.equipo_local_nombre}</span>
                    </div>
                    <div className="imprimir-marcador">
                      <strong>{p.goles_local}</strong>
                      <span>-</span>
                      <strong>{p.goles_visitante}</strong>
                      {p.es_walkover && <span className="imprimir-walkover-nota">(W.O.)</span>}
                    </div>
                    <div className="imprimir-partido-equipo imprimir-partido-equipo--visitante">
                      <span className={ganoVisitante(p) ? 'imprimir-equipo-gana' : ''}>{p.equipo_visitante_nombre}</span>
                      {p.equipo_visitante_escudo ? <img src={p.equipo_visitante_escudo} alt="" /> : <span className="imprimir-escudo-vacio" />}
                    </div>
                    <div className="imprimir-partido-estado">
                      {fechaJugado ? new Date(fechaJugado).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha registrada'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
