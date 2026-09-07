import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

export default function ImprimirJornada() {
  const { torneoId, jornada } = useParams();
  const { datos, cargando } = useCargaMinima(async () => {
    const torneo = await api('/torneos/' + torneoId);

    let partidos;
    if (torneo.formato === 'grupos') {
      const fases = await api('/fases?torneo_id=' + torneoId);
      const faseGrupos = fases.find((f) => f.tipo === 'grupos');
      const todos = faseGrupos ? await api(`/fases/${faseGrupos.id}/partidos`) : [];
      partidos = todos.filter((p) => String(p.jornada) === String(jornada));
    } else {
      const todos = await api('/partidos?torneo_id=' + torneoId);
      partidos = todos.filter((p) => String(p.jornada) === String(jornada));
    }

    return { torneo, partidos };
  }, [torneoId, jornada]);

  if (cargando || !datos) return <CargaJugador texto="Cargando la jornada..." />;

  const { torneo, partidos } = datos;

  function ganoLocal(p) {
    return p.estado === 'jugado' && p.goles_local > p.goles_visitante;
  }
  function ganoVisitante(p) {
    return p.estado === 'jugado' && p.goles_visitante > p.goles_local;
  }

  const jugados = partidos.filter((p) => p.estado === 'jugado');
  const todosJugados = partidos.length > 0 && jugados.length === partidos.length;
  const ningunoJugado = jugados.length === 0;

  const titulo = todosJugados ? `Resultados de la fecha ${jornada}`
    : ningunoJugado ? `Programación de la fecha ${jornada}`
    : `Resultados parciales de la fecha ${jornada}`;

  return (
    <div className="imprimir-page imprimir-page--jornada">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/fixture">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-jornada-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <span className="imprimir-jornada-eyebrow">{torneo.nombre}</span>
          <h1>{titulo}</h1>
          <p>{nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      <div className="imprimir-jornada-lista">
        {partidos.map((p) => (
          <div key={p.id} className="imprimir-partido-card">
            <div className="imprimir-partido-equipo">
              {p.equipo_local_escudo
                ? <img src={p.equipo_local_escudo} alt="" />
                : <span className="imprimir-escudo-vacio" />}
              <span className={ganoLocal(p) ? 'imprimir-equipo-gana' : ''}>{p.equipo_local_nombre}</span>
            </div>

            <div className="imprimir-marcador">
              {p.estado === 'jugado' ? (
                <>
                  <strong>{p.goles_local}</strong>
                  <span>-</span>
                  <strong>{p.goles_visitante}</strong>
                  {p.es_walkover && <span className="imprimir-walkover-nota">(W.O.)</span>}
                </>
              ) : (
                <span className="imprimir-marcador-pendiente">vs</span>
              )}
            </div>

            <div className="imprimir-partido-equipo imprimir-partido-equipo--visitante">
              <span className={ganoVisitante(p) ? 'imprimir-equipo-gana' : ''}>{p.equipo_visitante_nombre}</span>
              {p.equipo_visitante_escudo
                ? <img src={p.equipo_visitante_escudo} alt="" />
                : <span className="imprimir-escudo-vacio" />}
            </div>

            <div className="imprimir-partido-estado">
              {p.estado === 'jugado' ? (
                'Finalizado'
              ) : p.fecha_hora ? (
                new Date(p.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
              ) : (
                'Sin fecha programada'
              )}
            </div>
          </div>
        ))}

        {partidos.length === 0 && <p className="admin-empty">No hay partidos programados en esta jornada.</p>}
      </div>

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
