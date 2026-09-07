import { Fragment } from 'react';
import { nombreModalidad } from '../../lib/modalidad';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

// Si la llave es a ida y vuelta, la otra pierna del mismo cruce (o null si es a
// partido único).
function obtenerHermano(p, todos) {
  if (p.partido_ida_id) return todos.find((x) => x.id === p.partido_ida_id) || null;
  return todos.find((x) => x.partido_ida_id === p.id) || null;
}

// En eliminatoria, una vez jugado, dice si ese lado fue el que avanzó (para marcarlo
// con un asterisco). Si hay vuelta, se decide por el marcador GLOBAL de las dos
// piernas (y solo cuando las dos ya se jugaron); si no hay vuelta, por este
// partido solo, respetando ganador_id si hubo empate resuelto por penales.
function avanzo(p, esLocal, hermano) {
  if (p.estado !== 'jugado') return false;
  if (hermano) {
    if (hermano.estado !== 'jugado') return false;
    const esVuelta = !!p.partido_ida_id;
    const ida = esVuelta ? hermano : p;
    const vuelta = esVuelta ? p : hermano;
    const totalLocal = ida.goles_local + vuelta.goles_visitante;
    const totalVisitante = ida.goles_visitante + vuelta.goles_local;
    const ganadorId = (totalLocal === totalVisitante ? vuelta.ganador_id : null) ||
      (totalLocal > totalVisitante ? ida.equipo_local_id : totalVisitante > totalLocal ? ida.equipo_visitante_id : null);
    return esLocal ? ganadorId === p.equipo_local_id : ganadorId === p.equipo_visitante_id;
  }
  const ganadorId = p.ganador_id || (p.goles_local > p.goles_visitante
    ? p.equipo_local_id
    : p.goles_visitante > p.goles_local ? p.equipo_visitante_id : null);
  return esLocal ? ganadorId === p.equipo_local_id : ganadorId === p.equipo_visitante_id;
}

export default function ImprimirFixture() {
  const { torneoId } = useParams();
  const { datos, cargando } = useCargaMinima(async () => {
    const torneo = await api('/torneos/' + torneoId);
    const fases = await api('/fases?torneo_id=' + torneoId);
    const faseGrupos = fases.find((f) => f.tipo === 'grupos');
    const faseEliminatoria = fases.find((f) => f.tipo === 'eliminacion');

    let posicionesLiga = null;
    let posicionesGrupos = null;
    let cuadroEliminatoria = null;

    if (torneo.formato === 'liga') {
      posicionesLiga = await api('/partidos/posiciones?torneo_id=' + torneoId);
    } else if (faseGrupos) {
      posicionesGrupos = await api(`/fases/${faseGrupos.id}/posiciones`);
    }
    if (faseEliminatoria) {
      cuadroEliminatoria = await api(`/fases/${faseEliminatoria.id}/partidos`);
    }

    return { torneo, posicionesLiga, posicionesGrupos, cuadroEliminatoria };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando el fixture..." />;

  const { torneo, posicionesLiga, posicionesGrupos, cuadroEliminatoria } = datos;
  const rondas = cuadroEliminatoria
    ? [...new Set(cuadroEliminatoria.map((p) => p.jornada))].sort((a, b) => a - b)
    : [];

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
          <p>{torneo.formato === 'grupos' ? 'Fase de grupos' : 'Tabla de posiciones'} — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      {posicionesLiga && <TablaPosiciones titulo="Posiciones" tabla={posicionesLiga} />}

      {posicionesGrupos && posicionesGrupos.map((g) => (
        <TablaPosiciones key={g.grupo_id} titulo={g.grupo_nombre} tabla={g.tabla} />
      ))}

      {cuadroEliminatoria && cuadroEliminatoria.length > 0 && (
        <div className="imprimir-salto-pagina">
          <h2>Fase eliminatoria</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '-8px' }}>* = el equipo que avanzó en esa llave</p>
          {rondas.map((j) => (
            <div key={j} style={{ marginBottom: '16px' }}>
              <h3>{cuadroEliminatoria.find((p) => p.jornada === j && !p.es_tercer_puesto)?.ronda_nombre || `Ronda ${j}`}</h3>
              <table className="imprimir-tabla">
                <tbody>
                  {cuadroEliminatoria.filter((p) => p.jornada === j && !p.es_tercer_puesto && !p.partido_ida_id).map((ida) => {
                    const vuelta = obtenerHermano(ida, cuadroEliminatoria);
                    const etiquetaLlave = ida.llave && ida.ronda_nombre !== 'Final' ? `Llave ${ida.llave}` : '';
                    const ambosJugados = ida.estado === 'jugado' && vuelta && vuelta.estado === 'jugado';
                    const filaConPenales = ida.penales_local != null ? ida : (vuelta?.penales_local != null ? vuelta : null);
                    const penLocal = filaConPenales ? (filaConPenales === vuelta ? filaConPenales.penales_visitante : filaConPenales.penales_local) : null;
                    const penVisitante = filaConPenales ? (filaConPenales === vuelta ? filaConPenales.penales_local : filaConPenales.penales_visitante) : null;
                    const globalLocal = ambosJugados ? ida.goles_local + vuelta.goles_visitante : null;
                    const globalVisitante = ambosJugados ? ida.goles_visitante + vuelta.goles_local : null;
                    return (
                      <Fragment key={ida.id}>
                        <tr>
                          <td>{[etiquetaLlave, vuelta ? 'Ida' : null].filter(Boolean).join(' — ')}</td>
                          <td>{ida.equipo_local_nombre || ida.pendiente_local || 'Por definir'}{avanzo(ida, true, vuelta) && ' *'}</td>
                          <td>{ida.estado === 'jugado' ? `${ida.goles_local} - ${ida.goles_visitante}` : 'vs'}</td>
                          <td>{ida.equipo_visitante_nombre || ida.pendiente_visitante || 'Por definir'}{avanzo(ida, false, vuelta) && ' *'}</td>
                        </tr>
                        {vuelta && (
                          <tr key={vuelta.id}>
                            <td>{[etiquetaLlave, 'Vuelta'].filter(Boolean).join(' — ')}</td>
                            <td>{vuelta.equipo_local_nombre || vuelta.pendiente_local || 'Por definir'}{avanzo(vuelta, true, ida) && ' *'}</td>
                            <td>{vuelta.estado === 'jugado' ? `${vuelta.goles_local} - ${vuelta.goles_visitante}` : 'vs'}</td>
                            <td>{vuelta.equipo_visitante_nombre || vuelta.pendiente_visitante || 'Por definir'}{avanzo(vuelta, false, ida) && ' *'}</td>
                          </tr>
                        )}
                        {ambosJugados && (
                          <tr key={ida.id + '-global'}>
                            <td></td>
                            <td colSpan={3} style={{ fontWeight: 600 }}>
                              Global: {globalLocal} - {globalVisitante}
                              {filaConPenales && ` (definido por penales, ${penLocal}-${penVisitante})`}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {cuadroEliminatoria.filter((p) => p.jornada === j && p.es_tercer_puesto).map((p) => (
                <div key={p.id}>
                  <h3>Partido por el tercer puesto</h3>
                  <table className="imprimir-tabla">
                    <tbody>
                      <tr>
                        <td>{p.equipo_local_nombre || p.pendiente_local || 'Por definir'}{avanzo(p, true, null) && ' *'}</td>
                        <td>{p.estado === 'jugado' ? `${p.goles_local} - ${p.goles_visitante}` : 'vs'}</td>
                        <td>{p.equipo_visitante_nombre || p.pendiente_visitante || 'Por definir'}{avanzo(p, false, null) && ' *'}</td>
                      </tr>
                      {p.penales_local != null && (
                        <tr><td></td><td colSpan={2}>Definido por penales, {p.penales_local}-{p.penales_visitante}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
        </div>
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

function TablaPosiciones({ titulo, tabla }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h2>{titulo}</h2>
      <table className="imprimir-tabla">
        <thead>
          <tr>
            <th>#</th><th></th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          {tabla.map((f, i) => (
            <tr key={f.equipo_id}>
              <td>{i + 1}</td>
              <td className="imprimir-tabla-escudo">
                {f.escudo_url
                  ? <img src={f.escudo_url} alt="" />
                  : <span className="imprimir-escudo-vacio" />}
              </td>
              <td>
                {f.nombre}{f.requiere_sorteo && ' (pendiente de sorteo)'}
                {f.estado_torneo && f.estado_torneo !== 'activo' && ` (${f.estado_torneo})`}
              </td>
              <td>{f.pj}</td><td>{f.pg}</td><td>{f.pe}</td><td>{f.pp}</td>
              <td>{f.gf}</td><td>{f.gc}</td><td>{f.dif}</td>
              <td>{f.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
