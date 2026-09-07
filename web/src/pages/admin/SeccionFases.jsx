import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useModal } from '../../context/ModalContext';
import CuadroBracket from '../../components/CuadroBracket';
import { TRANSMISION_EN_VIVO_HABILITADA } from '../../lib/features';

// Estos componentes muestran una fase de grupos o de eliminatoria ya generada por
// el asistente único de "Generar fixture" (ver ConfiguradorFixture). Ya no se crean
// fases sueltas a mano: todo sale de esa configuración inicial.

// Tabla de posiciones reutilizable (grupos o liga). Cuando 2+ equipos quedan
// exactamente empatados en todo (sin ningún criterio deportivo que los distinga),
// muestra un aviso y un botón para sortear el orden — pide antes los nombres de
// los delegados presentes, como prueba de que el sorteo se hizo frente a ellos.
export function TablaPosiciones({ tabla, clasifican, onSortear }) {
  const modal = useModal();
  const [sorteando, setSorteando] = useState(null);

  const empates = {};
  tabla.forEach((f) => {
    if (f.requiere_sorteo) (empates[f.grupo_empate] ||= []).push(f);
  });

  async function sortear(equipos) {
    const delegados = await modal.preguntar({
      titulo: 'Sorteo de desempate',
      mensaje: `Estos equipos quedaron exactamente empatados (puntos, enfrentamientos directos, diferencia y goles): ${equipos.map((e) => e.nombre).join(', ')}. No hay ningún criterio deportivo que los distinga. Antes de sortear, escribe los nombres de los delegados de cada equipo que están presenciando el sorteo.`,
      placeholder: 'Ej: Juan Pérez (Equipo A), María Gómez (Equipo B)',
      textoAceptar: 'Sortear ahora'
    });
    if (!delegados) return;

    setSorteando(equipos[0].grupo_empate);
    try {
      const resultado = await onSortear(equipos.map((e) => e.equipo_id), delegados);
      const orden = resultado?.orden_resultado_nombres;
      const detalle = orden ? orden.map((nombre, i) => `${i + 1}° ${nombre}`).join(', ') : null;
      await modal.exito(
        detalle ? `Quedó así: ${detalle}.` : 'La tabla quedó ordenada con el resultado.',
        'Sorteo realizado'
      );
    } catch (err) {
      await modal.error(err.message, 'No se pudo sortear');
    } finally {
      setSorteando(null);
    }
  }

  const hayEmpatesResueltos = tabla.some((f) => f.resuelto_por_sorteo);

  return (
    <>
      <p className="admin-criterios-desempate">
        Desempate, en este orden: puntos → diferencia de gol general → enfrentamiento directo entre los empatados → goles a favor general → sorteo (con delegados presentes).
      </p>
      <table className="admin-tabla-posiciones">
        <thead>
          <tr><th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th></tr>
        </thead>
        <tbody>
          {tabla.map((f, i) => (
            <tr key={f.equipo_id} className={f.clasifica || (clasifican && i < clasifican) ? 'admin-fila-clasifica' : ''}>
              <td>{i + 1}</td>
              <td className="admin-tabla-equipo">
                {f.escudo_url ? <img src={f.escudo_url} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
                {f.nombre}
                {f.requiere_sorteo && <span className="admin-badge-empate">Empate — falta sorteo</span>}
                {f.resuelto_por_sorteo && (
                  <span
                    className="admin-badge-sorteado"
                    title={`Sorteado el ${new Date(f.sorteo_fecha).toLocaleString('es-CO')}. Delegados presentes: ${f.sorteo_delegados}`}
                  >
                    Puesto definido por sorteo
                  </span>
                )}
                {f.estado_torneo && f.estado_torneo !== 'activo' && (
                  <span className="admin-badge-baja" title={f.baja_motivo || ''}>
                    {f.estado_torneo === 'descalificado' ? 'Descalificado' : 'Retirado'}
                  </span>
                )}
              </td>
              <td>{f.pj}</td><td>{f.pg}</td><td>{f.pe}</td><td>{f.pp}</td>
              <td>{f.gf}</td><td>{f.gc}</td><td>{f.dif}</td>
              <td><strong>{f.pts}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      {hayEmpatesResueltos && <p className="admin-ayuda">Pasa el mouse sobre "Puesto definido por sorteo" para ver fecha y delegados presentes.</p>}
      {onSortear && Object.entries(empates).map(([clave, equipos]) => (
        <div key={clave} className="admin-alerta-empate">
          <span>Empate total entre {equipos.map((e) => e.nombre).join(', ')}: ningún criterio deportivo los distingue.</span>
          <button type="button" className="admin-btn-editar" onClick={() => sortear(equipos)} disabled={sorteando === clave}>
            {sorteando === clave ? 'Sorteando...' : 'Sortear con delegados presentes'}
          </button>
        </div>
      ))}
    </>
  );
}

// Historial de todos los sorteos de desempate ya hechos en el campeonato: en qué
// grupo (o "Tabla general"), qué equipos estaban empatados, en qué orden salió el
// sorteo, quiénes lo presenciaron y cuándo. Es el registro/prueba de cada sorteo.
export function HistorialSorteos({ torneoId }) {
  const [sorteos, setSorteos] = useState([]);

  useEffect(() => {
    api(`/torneos/${torneoId}/sorteos`).then(setSorteos);
  }, [torneoId]);

  if (sorteos.length === 0) return null;

  return (
    <section className="admin-card">
      <h2>Historial de sorteos de desempate</h2>
      <div className="admin-tabla-posiciones-wrap">
        <table className="admin-tabla-posiciones admin-tabla-sorteos">
          <thead>
            <tr>
              <th>Fecha</th><th>Dónde</th><th>Equipos empatados</th><th>Orden que salió</th><th>Delegados presentes</th>
            </tr>
          </thead>
          <tbody>
            {sorteos.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.creado_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{s.grupo_nombre}</td>
                <td>{s.equipos.join(', ')}</td>
                <td>{s.orden_resultado.map((nombre, i) => `${i + 1}° ${nombre}`).join(', ')}</td>
                <td>{s.delegados_presentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FaseGrupos({ fase, equiposAprobados, onCambio }) {
  const modal = useModal();
  const [partidos, setPartidos] = useState([]);
  const [posiciones, setPosiciones] = useState([]);
  const [generando, setGenerando] = useState(false);

  useEffect(() => { cargarPartidosYPosiciones(); }, [fase.id]);

  async function cargarPartidosYPosiciones() {
    const [p, pos] = await Promise.all([
      api(`/fases/${fase.id}/partidos`),
      api(`/fases/${fase.id}/posiciones`)
    ]);
    setPartidos(p);
    setPosiciones(pos);
  }

  async function alternarEquipo(grupo, equipoId) {
    const actuales = (grupo.equipos || []).map((e) => e.id);
    const nuevos = actuales.includes(equipoId) ? actuales.filter((id) => id !== equipoId) : [...actuales, equipoId];
    await api(`/fases/grupos/${grupo.id}/equipos`, { method: 'PUT', body: JSON.stringify({ equipo_ids: nuevos }) });
    onCambio();
  }

  async function sortearGrupos() {
    const confirmado = await modal.confirmar({
      titulo: '¿Sortear los equipos entre los grupos?',
      mensaje: 'Se reparten al azar, en partes iguales, todos los equipos aprobados entre los grupos ya creados. Si ya habías asignado equipos a mano, se reemplaza.',
      textoAceptar: 'Sortear'
    });
    if (!confirmado) return;

    const barajados = [...equiposAprobados];
    for (let i = barajados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [barajados[i], barajados[j]] = [barajados[j], barajados[i]];
    }
    const grupos = fase.grupos || [];
    const porGrupo = grupos.map(() => []);
    barajados.forEach((eq, i) => porGrupo[i % grupos.length].push(eq.id));

    await Promise.all(grupos.map((g, i) =>
      api(`/fases/grupos/${g.id}/equipos`, { method: 'PUT', body: JSON.stringify({ equipo_ids: porGrupo[i] }) })
    ));
    onCambio();
  }

  async function sortearGrupo(grupoId, equiposIds, delegadosPresentes) {
    const resultado = await api(`/fases/grupos/${grupoId}/sorteos`, {
      method: 'POST',
      body: JSON.stringify({ equipos_ids: equiposIds, delegados_presentes: delegadosPresentes })
    });
    await cargarPartidosYPosiciones();
    onCambio();
    return resultado;
  }

  async function generarFixtureGrupos() {
    const confirmado = await modal.confirmar({
      titulo: '¿Generar el fixture de los grupos?',
      mensaje: 'Se arma el todos-contra-todos dentro de cada grupo con los equipos que asignaste. Revisa bien antes de generar.',
      textoAceptar: 'Generar fixture'
    });
    if (!confirmado) return;
    setGenerando(true);
    try {
      const data = await api(`/fases/${fase.id}/generar`, { method: 'POST' });
      await cargarPartidosYPosiciones();
      await modal.exito(`Se generaron ${data.generados} partidos.`);
    } catch (err) {
      await modal.error(err.message, 'No se pudo generar el fixture');
    } finally {
      setGenerando(false);
    }
  }

  const jornadas = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  const gruposIncompletos = (fase.grupos || []).some((g) => (g.equipos || []).length < 2);

  return (
    <section className="admin-card">
      <h2>Fase de grupos</h2>

      {partidos.length === 0 && equiposAprobados.length > 0 && (
        <button type="button" className="admin-btn-editar" onClick={sortearGrupos}>Sortear equipos entre los grupos</button>
      )}

      {(fase.grupos || []).map((grupo) => (
        <div key={grupo.id} className="admin-grupo-card">
          <div className="admin-grupo-header">
            <strong>{grupo.nombre}</strong>
          </div>
          {partidos.length === 0 ? (
            <div className="admin-checkbox-lista">
              {equiposAprobados.map((eq) => (
                <label key={eq.id} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={(grupo.equipos || []).some((e) => e.id === eq.id)}
                    onChange={() => alternarEquipo(grupo, eq.id)}
                  />
                  {eq.nombre}
                </label>
              ))}
              {equiposAprobados.length === 0 && <p className="admin-empty">No hay equipos aprobados todavía.</p>}
            </div>
          ) : (
            <p className="admin-ayuda">{(grupo.equipos || []).map((e) => e.nombre).join(', ')}</p>
          )}
        </div>
      ))}

      {partidos.length === 0 ? (
        <button type="button" onClick={generarFixtureGrupos} disabled={generando || gruposIncompletos} className="subida-imagen-btn">
          {generando ? 'Generando...' : 'Generar fixture de los grupos'}
        </button>
      ) : (
        <>
          {fase.clasifican > 0 && (
            <p className="admin-ayuda">
              <span className="admin-punto-clasifica" /> resaltado = clasifica
              {fase.mejores_terceros > 0 ? ` (top ${fase.clasifican} de cada grupo, más los ${fase.mejores_terceros} mejores terceros)` : ` (top ${fase.clasifican} de cada grupo)`}
            </p>
          )}
          {posiciones.map((grupoPos) => (
            <div key={grupoPos.grupo_id} className="admin-tabla-posiciones-wrap">
              <span className="subida-imagen-label">{grupoPos.grupo_nombre}</span>
              <TablaPosiciones
                tabla={grupoPos.tabla}
                onSortear={(ids, delegados) => sortearGrupo(grupoPos.grupo_id, ids, delegados)}
              />
            </div>
          ))}

          <div className="admin-list admin-list--alta">
            {jornadas.map((j) => (
              <div key={j} className="admin-jornada">
                <div className="admin-jornada-titulo">
                  <h3>Jornada {j}</h3>
                  <Link to={`/admin/imprimir/jornada/${fase.torneo_id}/${j}`} target="_blank" className="admin-link-imprimir">Imprimir</Link>
                </div>
                {partidos.filter((p) => p.jornada === j).map((p) => (
                  <PartidoFila key={p.id} partido={p} onGuardado={cargarPartidosYPosiciones} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function FaseEliminatoria({ fase }) {
  const modal = useModal();
  const [partidos, setPartidos] = useState([]);
  const [editando, setEditando] = useState(false);
  const [orden, setOrden] = useState([]);
  const [editandoPosiciones, setEditandoPosiciones] = useState(false);
  const [ordenPosiciones, setOrdenPosiciones] = useState([]);
  const [guardandoCruces, setGuardandoCruces] = useState(false);
  const [vista, setVista] = useState('lista');

  useEffect(() => { cargarPartidos(); }, [fase.id]);

  async function cargarPartidos() {
    setPartidos(await api(`/fases/${fase.id}/partidos`));
  }

  const partidosRonda1 = partidos.filter((p) => p.jornada === 1);
  const ronda1Existe = partidosRonda1.length > 0;
  const ronda1Definida = ronda1Existe && !!partidosRonda1[0].equipo_local_id;
  const ronda1SinJugar = ronda1Existe && partidosRonda1.every((p) => p.estado !== 'jugado');

  function empezarEdicion() {
    setOrden(partidosRonda1.map((p) => [p.equipo_local_id, p.equipo_visitante_id]));
    setEditando(true);
  }

  function moverEquipo(indiceOrigen, ladoOrigen, indiceDestino, ladoDestino) {
    setOrden((actual) => {
      const copia = actual.map((par) => [...par]);
      const temp = copia[indiceDestino][ladoDestino];
      copia[indiceDestino][ladoDestino] = copia[indiceOrigen][ladoOrigen];
      copia[indiceOrigen][ladoOrigen] = temp;
      return copia;
    });
  }

  async function guardarCruces() {
    setGuardandoCruces(true);
    try {
      await api(`/fases/${fase.id}/cruces`, { method: 'PUT', body: JSON.stringify({ pares: orden }) });
      setEditando(false);
      await cargarPartidos();
      await modal.exito('Cruces actualizados.');
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar el cruce');
    } finally {
      setGuardandoCruces(false);
    }
  }

  const etiquetasPorPosicion = {};
  partidosRonda1.forEach((p) => {
    etiquetasPorPosicion[p.orden_semilla_local] = p.pendiente_local || p.equipo_local_nombre;
    etiquetasPorPosicion[p.orden_semilla_visitante] = p.pendiente_visitante || p.equipo_visitante_nombre;
  });

  function empezarEdicionPosiciones() {
    setOrdenPosiciones(partidosRonda1.map((p) => [p.orden_semilla_local, p.orden_semilla_visitante]));
    setEditandoPosiciones(true);
  }

  function moverPosicion(indiceOrigen, ladoOrigen, indiceDestino, ladoDestino) {
    setOrdenPosiciones((actual) => {
      const copia = actual.map((par) => [...par]);
      const temp = copia[indiceDestino][ladoDestino];
      copia[indiceDestino][ladoDestino] = copia[indiceOrigen][ladoOrigen];
      copia[indiceOrigen][ladoOrigen] = temp;
      return copia;
    });
  }

  async function guardarPosiciones() {
    setGuardandoCruces(true);
    try {
      await api(`/fases/${fase.id}/orden-semillas`, { method: 'PUT', body: JSON.stringify({ pares: ordenPosiciones }) });
      setEditandoPosiciones(false);
      await cargarPartidos();
      await modal.exito('Cruces actualizados.');
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar el cruce');
    } finally {
      setGuardandoCruces(false);
    }
  }

  const jornadas = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  const final = partidos.find((p) => p.ronda_nombre === 'Final');
  const yaHuboFinal = final && final.estado === 'jugado';
  const equiposPorId = {};
  partidosRonda1.forEach((p) => {
    equiposPorId[p.equipo_local_id] = p.equipo_local_nombre;
    equiposPorId[p.equipo_visitante_id] = p.equipo_visitante_nombre;
  });

  if (partidos.length === 0) return null;

  return (
    <section className="admin-card">
      <h2>Fase eliminatoria</h2>

      {!editando && !editandoPosiciones && (
        <div className="admin-form-linea">
          <button type="button" className={vista === 'lista' ? 'subida-imagen-btn' : 'admin-btn-editar'} onClick={() => setVista('lista')}>Lista</button>
          <button type="button" className={vista === 'cuadro' ? 'subida-imagen-btn' : 'admin-btn-editar'} onClick={() => setVista('cuadro')}>Ver cuadro</button>
          <Link to={`/admin/imprimir/cuadro/${fase.torneo_id}`} target="_blank" className="admin-link-imprimir">Imprimir cuadro</Link>
        </div>
      )}

      {jornadas.length > 0 && <p className="admin-ayuda">* = el equipo que avanzó en esa llave</p>}

      {ronda1SinJugar && !editando && !editandoPosiciones && (
        <div className="admin-form-linea">
          {fase.modo !== 'sorteo' && (
            <button type="button" className="admin-btn-editar" onClick={empezarEdicionPosiciones}>Personalizar el orden de los cruces</button>
          )}
          {ronda1Definida && (
            <button type="button" className="admin-btn-editar" onClick={empezarEdicion}>Editar cruces de la primera ronda</button>
          )}
        </div>
      )}

      {vista === 'cuadro' && !editando && !editandoPosiciones && <CuadroBracket partidos={partidos} />}

      {editandoPosiciones ? (
        <div className="admin-jornada">
          <span className="subida-imagen-label">Editando por posición: {nombreRondaFrontend(ordenPosiciones.length * 2)}</span>
          <p className="admin-ayuda">Elige qué posición enfrenta a cuál — todavía no se sabe qué equipo real ocupa cada una.</p>
          {ordenPosiciones.map((par, i) => (
            <div key={i} className="admin-partido-fila">
              <select value={par[0]} onChange={(e) => {
                const nueva = Number(e.target.value);
                const origen = ordenPosiciones.findIndex((p, idx) => idx !== i && (p[0] === nueva || p[1] === nueva));
                if (origen === -1) return;
                const lado = ordenPosiciones[origen][0] === nueva ? 0 : 1;
                moverPosicion(origen, lado, i, 0);
              }}>
                {Object.entries(etiquetasPorPosicion).map(([pos, etiqueta]) => <option key={pos} value={pos}>{etiqueta}</option>)}
              </select>
              <span>vs</span>
              <select value={par[1]} onChange={(e) => {
                const nueva = Number(e.target.value);
                const origen = ordenPosiciones.findIndex((p, idx) => idx !== i && (p[0] === nueva || p[1] === nueva));
                if (origen === -1) return;
                const lado = ordenPosiciones[origen][0] === nueva ? 0 : 1;
                moverPosicion(origen, lado, i, 1);
              }}>
                {Object.entries(etiquetasPorPosicion).map(([pos, etiqueta]) => <option key={pos} value={pos}>{etiqueta}</option>)}
              </select>
            </div>
          ))}
          <div className="admin-form-linea">
            <button type="button" className="subida-imagen-btn" onClick={guardarPosiciones} disabled={guardandoCruces}>
              {guardandoCruces ? 'Guardando...' : 'Guardar cruces'}
            </button>
            <button type="button" className="publico-quitar" onClick={() => setEditandoPosiciones(false)}>Cancelar</button>
          </div>
        </div>
      ) : editando ? (
        <div className="admin-jornada">
          <span className="subida-imagen-label">Editando: {nombreRondaFrontend(orden.length * 2)}</span>
          {orden.map((par, i) => (
            <div key={i} className="admin-partido-fila">
              <select value={par[0]} onChange={(e) => {
                const nuevoId = Number(e.target.value);
                const origen = orden.findIndex((p, idx) => idx !== i && (p[0] === nuevoId || p[1] === nuevoId));
                if (origen === -1) return;
                const lado = orden[origen][0] === nuevoId ? 0 : 1;
                moverEquipo(origen, lado, i, 0);
              }}>
                {Object.entries(equiposPorId).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
              <span>vs</span>
              <select value={par[1]} onChange={(e) => {
                const nuevoId = Number(e.target.value);
                const origen = orden.findIndex((p, idx) => idx !== i && (p[0] === nuevoId || p[1] === nuevoId));
                if (origen === -1) return;
                const lado = orden[origen][0] === nuevoId ? 0 : 1;
                moverEquipo(origen, lado, i, 1);
              }}>
                {Object.entries(equiposPorId).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
            </div>
          ))}
          <div className="admin-form-linea">
            <button type="button" className="subida-imagen-btn" onClick={guardarCruces} disabled={guardandoCruces}>
              {guardandoCruces ? 'Guardando...' : 'Guardar cruces'}
            </button>
            <button type="button" className="publico-quitar" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : vista === 'lista' ? (
        <div className="admin-list admin-list--alta">
          {jornadas.map((j) => {
            const idasDeJornada = partidos.filter((p) => p.jornada === j && !p.es_tercer_puesto && !p.partido_ida_id);
            return (
              <div key={j} className="admin-jornada">
                <span className="subida-imagen-label">{partidos.find((p) => p.jornada === j)?.ronda_nombre || `Ronda ${j}`}</span>
                {idasDeJornada.map((ida) => {
                  const vuelta = partidos.find((p) => p.partido_ida_id === ida.id);
                  return (
                    <div key={ida.id} className="admin-llave-bloque">
                      {vuelta && <span className="admin-fase-tipo">Ida</span>}
                      <PartidoFila partido={ida} hermano={vuelta} onGuardado={cargarPartidos} eliminatoria />
                      {vuelta && (
                        <>
                          <span className="admin-fase-tipo">Vuelta</span>
                          <PartidoFila partido={vuelta} hermano={ida} onGuardado={cargarPartidos} eliminatoria />
                        </>
                      )}
                    </div>
                  );
                })}
                {partidos.filter((p) => p.jornada === j && p.es_tercer_puesto).map((p) => (
                  <div key={p.id}>
                    <span className="subida-imagen-label">Partido por el tercer puesto</span>
                    <PartidoFila partido={p} onGuardado={cargarPartidos} eliminatoria />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {yaHuboFinal && <p className="admin-empty">Ya se jugó la final de esta fase.</p>}
    </section>
  );
}

function nombreRondaFrontend(numEquipos) {
  const nombres = { 2: 'Final', 4: 'Semifinal', 8: 'Cuartos de Final', 16: 'Octavos de Final', 32: 'Dieciseisavos de Final' };
  return nombres[numEquipos] || `Ronda de ${numEquipos}`;
}

// Los campos datetime-local muestran/editan en hora LOCAL del navegador, pero la
// base de datos guarda en UTC.
function fechaParaInput(fechaUtc) {
  if (!fechaUtc) return '';
  const d = new Date(fechaUtc);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function PartidoFila({ partido, hermano, onGuardado, eliminatoria }) {
  const modal = useModal();
  const [golesLocal, setGolesLocal] = useState(partido.goles_local ?? '');
  const [golesVisitante, setGolesVisitante] = useState(partido.goles_visitante ?? '');
  const [guardando, setGuardando] = useState(false);
  const [editandoHorario, setEditandoHorario] = useState(false);
  const [horario, setHorario] = useState(fechaParaInput(partido.fecha_hora));
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  const [editandoTransmision, setEditandoTransmision] = useState(false);
  const [transmision, setTransmision] = useState(partido.url_transmision || '');
  const [guardandoTransmision, setGuardandoTransmision] = useState(false);

  async function guardarHorario() {
    setGuardandoHorario(true);
    try {
      await api(`/partidos/${partido.id}/horario`, {
        method: 'PATCH',
        body: JSON.stringify({ fecha_hora: horario ? new Date(horario).toISOString() : null })
      });
      setEditandoHorario(false);
      onGuardado();
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar el horario');
    } finally {
      setGuardandoHorario(false);
    }
  }

  async function guardarTransmision() {
    setGuardandoTransmision(true);
    try {
      await api(`/partidos/${partido.id}/transmision`, {
        method: 'PATCH',
        body: JSON.stringify({ url_transmision: transmision })
      });
      setEditandoTransmision(false);
      onGuardado();
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar el enlace de transmisión');
    } finally {
      setGuardandoTransmision(false);
    }
  }

  async function marcarWalkover() {
    const ausenteId = await modal.elegir({
      titulo: 'Walkover: equipo que no se presentó',
      mensaje: 'El rival gana automáticamente 3-0. ¿Cuál equipo no se presentó?',
      opciones: [
        { valor: partido.equipo_local_id, texto: partido.equipo_local_nombre },
        { valor: partido.equipo_visitante_id, texto: partido.equipo_visitante_nombre }
      ]
    });
    if (!ausenteId) return;

    setGuardando(true);
    try {
      const resultado = await api(`/partidos/${partido.id}/walkover`, {
        method: 'PATCH',
        body: JSON.stringify({ equipo_ausente_id: ausenteId })
      });
      onGuardado();
      if (resultado.descalificado) {
        await modal.error(
          `Con esta ya son 2 inasistencias: el equipo quedó descalificado automáticamente. Se le dieron por perdidos ${resultado.descalificado.walkoversAplicados} partido(s) pendiente(s) más.`,
          'Equipo descalificado (doble walkover)'
        );
      } else if (resultado.aviso_clasificacion) {
        await modal.error(resultado.aviso_clasificacion, 'Revisa el cuadro eliminatorio');
      } else {
        await modal.exito('Walkover registrado: 3-0.');
      }
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar el walkover');
    } finally {
      setGuardando(false);
    }
  }

  async function guardar() {
    if (golesLocal === '' || golesVisitante === '') return;

    let motivo;
    if (partido.estado === 'jugado') {
      motivo = await modal.preguntar({
        titulo: 'Corregir un resultado ya cargado',
        mensaje: 'Este partido ya tenía un resultado. Indica por qué lo estás corrigiendo (ej. impugnación, error del árbitro, etc.).',
        placeholder: 'Motivo de la corrección',
        textoAceptar: 'Guardar corrección'
      });
      if (!motivo) return;
    }

    // Si esta llave es a ida y vuelta y la otra pierna ya se jugó, lo que importa
    // es el marcador GLOBAL de las dos, no el de este partido solo.
    const esVuelta = !!partido.partido_ida_id;
    let empatado;
    if (hermano && hermano.estado === 'jugado') {
      const idaGolesLocal = esVuelta ? hermano.goles_local : Number(golesLocal);
      const idaGolesVisitante = esVuelta ? hermano.goles_visitante : Number(golesVisitante);
      const vueltaGolesLocal = esVuelta ? Number(golesLocal) : hermano.goles_local;
      const vueltaGolesVisitante = esVuelta ? Number(golesVisitante) : hermano.goles_visitante;
      empatado = (idaGolesLocal + vueltaGolesVisitante) === (idaGolesVisitante + vueltaGolesLocal);
    } else {
      empatado = Number(golesLocal) === Number(golesVisitante);
    }

    let penalesResultado = null;
    if (eliminatoria && empatado) {
      penalesResultado = await modal.penales({
        titulo: hermano ? 'Empate en el marcador global de la llave' : 'Empate en un partido de eliminatoria',
        mensaje: 'Se definió por penales. Anota el marcador de la tanda.',
        equipoLocal: partido.equipo_local_nombre,
        equipoVisitante: partido.equipo_visitante_nombre
      });
      if (!penalesResultado) return;
    }

    setGuardando(true);
    try {
      const resultado = await api(`/partidos/${partido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          goles_local: Number(golesLocal), goles_visitante: Number(golesVisitante),
          penales_local: penalesResultado?.local ?? null, penales_visitante: penalesResultado?.visitante ?? null,
          motivo
        })
      });
      onGuardado();
      if (resultado.aviso_clasificacion) {
        await modal.error(resultado.aviso_clasificacion, 'Revisa el cuadro eliminatorio');
      } else {
        await modal.exito('Resultado guardado.');
      }
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar el resultado');
    } finally {
      setGuardando(false);
    }
  }

  const porDefinir = !partido.equipo_local_id || !partido.equipo_visitante_id;
  const etiquetaLlave = eliminatoria && partido.llave && partido.ronda_nombre !== 'Final' ? `Llave ${partido.llave}` : null;

  // La pierna que de verdad quedó empatada (esta o su hermana) es la que trae el
  // marcador de penales, si se llegó a esa instancia. Si la que se definió fue la
  // vuelta, sus penales quedan en SU propio local/visitante (invertido respecto a
  // la ida), así que hay que voltearlos para mostrarlos en el mismo orden que el
  // marcador global (equipo local de la ida primero).
  const filaConPenales = partido.penales_local != null
    ? partido
    : (hermano && hermano.penales_local != null ? hermano : null);
  const filaPenalesEsVuelta = !!filaConPenales?.partido_ida_id;
  const penLocal = filaConPenales ? (filaPenalesEsVuelta ? filaConPenales.penales_visitante : filaConPenales.penales_local) : null;
  const penVisitante = filaConPenales ? (filaPenalesEsVuelta ? filaConPenales.penales_local : filaConPenales.penales_visitante) : null;

  // En eliminatoria, una vez jugado (las dos piernas, si es a ida y vuelta), marca
  // con * al que avanza: el que definió ganador_id si hubo empate resuelto por
  // penales, o el que anotó más goles — en el GLOBAL de la llave si hay vuelta.
  let avanzaLocal = false;
  let avanzaVisitante = false;
  let agregadoLocal = null;
  let agregadoVisitante = null;
  if (eliminatoria && partido.estado === 'jugado') {
    if (hermano && hermano.estado === 'jugado') {
      const esVuelta = !!partido.partido_ida_id;
      const ida = esVuelta ? hermano : partido;
      const vuelta = esVuelta ? partido : hermano;
      agregadoLocal = ida.goles_local + vuelta.goles_visitante;
      agregadoVisitante = ida.goles_visitante + vuelta.goles_local;
      const ganadorId = (agregadoLocal === agregadoVisitante ? vuelta.ganador_id : null) || (agregadoLocal > agregadoVisitante
        ? ida.equipo_local_id
        : agregadoVisitante > agregadoLocal ? ida.equipo_visitante_id : null);
      avanzaLocal = ganadorId === partido.equipo_local_id;
      avanzaVisitante = ganadorId === partido.equipo_visitante_id;
    } else if (!hermano) {
      const ganadorId = partido.ganador_id || (partido.goles_local > partido.goles_visitante
        ? partido.equipo_local_id
        : partido.goles_visitante > partido.goles_local ? partido.equipo_visitante_id : null);
      avanzaLocal = ganadorId === partido.equipo_local_id;
      avanzaVisitante = ganadorId === partido.equipo_visitante_id;
    }
  }

  if (porDefinir) {
    return (
      <div className="admin-partido-fila admin-partido-fila--pendiente">
        {etiquetaLlave && <span className="admin-fase-tipo">{etiquetaLlave}</span>}
        <span className="admin-partido-equipo">{partido.equipo_local_nombre || partido.pendiente_local || 'Por definir'}</span>
        <span>vs</span>
        <span className="admin-partido-equipo admin-partido-equipo--visitante">{partido.equipo_visitante_nombre || partido.pendiente_visitante || 'Por definir'}</span>
      </div>
    );
  }

  const jugado = partido.estado === 'jugado';

  return (
    <div className="admin-partido-bloque">
      <div className="admin-partido-meta">
        <span className="admin-partido-meta-tags">
          {etiquetaLlave && <span className="admin-fase-tipo">{etiquetaLlave}</span>}
          {partido.es_intergrupo && <span className="admin-fase-tipo">Intergrupo</span>}
        </span>
        {jugado ? (
          <span className="admin-partido-estado-badge admin-partido-estado-badge--jugado">Finalizado</span>
        ) : partido.fecha_hora ? (
          <span className="admin-partido-estado-badge admin-partido-estado-badge--programado">
            {new Date(partido.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
            {partido.estado === 'reprogramado' && <span className="admin-badge-reprogramado">Reprogramado</span>}
          </span>
        ) : (
          <span className="admin-partido-estado-badge admin-partido-estado-badge--pendiente">Sin fecha programada</span>
        )}
      </div>

      <div className="admin-partido-fila">
        <span className="admin-partido-equipo">
          {partido.equipo_local_nombre}{avanzaLocal && <strong> *</strong>}
          {partido.equipo_local_escudo ? <img src={partido.equipo_local_escudo} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
        </span>
        <input type="number" min="0" value={golesLocal} onChange={(e) => setGolesLocal(e.target.value)} className="admin-partido-marcador" />
        <span>-</span>
        <input type="number" min="0" value={golesVisitante} onChange={(e) => setGolesVisitante(e.target.value)} className="admin-partido-marcador" />
        <span className="admin-partido-equipo admin-partido-equipo--visitante">
          {partido.equipo_visitante_escudo ? <img src={partido.equipo_visitante_escudo} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
          {avanzaVisitante && <strong>* </strong>}{partido.equipo_visitante_nombre}
        </span>
        {!hermano && filaConPenales && (
          <span className="admin-badge-penales">Pen. {penLocal}-{penVisitante}</span>
        )}
        {partido.es_walkover && <span className="admin-badge-baja">W.O.</span>}
      </div>

      {agregadoLocal !== null && !!partido.partido_ida_id && (
        <p className="admin-ayuda admin-agregado-llave">
          Global de la llave: {agregadoLocal} - {agregadoVisitante}
          {filaConPenales && ` (definido por penales, ${penLocal}-${penVisitante})`}
        </p>
      )}

      <div className="admin-partido-acciones">
        <div className="admin-partido-enlaces">
          <Link to={`/arbitro/planilla/${partido.id}`} target="_blank">Ver planilla</Link>
          {jugado && <Link to={`/arbitro/informe/${partido.id}`} target="_blank">Ver informe</Link>}
        </div>
        <div className="admin-partido-acciones-botones">
          {!eliminatoria && !jugado && (
            <button type="button" className="publico-quitar" onClick={marcarWalkover} disabled={guardando}>No se presentó</button>
          )}
          <button type="button" className="admin-btn-editar" onClick={guardar} disabled={guardando}>
            {jugado ? 'Editar' : 'Guardar'}
          </button>
        </div>
      </div>

      {!jugado && (
        <div className="admin-partido-horario">
          {editandoHorario ? (
            <>
              <input
                type="datetime-local"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
              <button type="button" className="admin-btn-editar" onClick={guardarHorario} disabled={guardandoHorario}>Guardar</button>
              <button type="button" className="publico-quitar" onClick={() => { setEditandoHorario(false); setHorario(fechaParaInput(partido.fecha_hora)); }}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="publico-quitar" onClick={() => setEditandoHorario(true)}>
              {partido.fecha_hora ? 'Cambiar fecha' : 'Programar fecha'}
            </button>
          )}
        </div>
      )}

      {TRANSMISION_EN_VIVO_HABILITADA && (
        <div className="admin-partido-horario">
          {editandoTransmision ? (
            <>
              <input
                type="url"
                placeholder="Enlace de YouTube Live o Facebook Live de este partido"
                value={transmision}
                onChange={(e) => setTransmision(e.target.value)}
              />
              <button type="button" className="admin-btn-editar" onClick={guardarTransmision} disabled={guardandoTransmision}>Guardar</button>
              <button type="button" className="publico-quitar" onClick={() => { setEditandoTransmision(false); setTransmision(partido.url_transmision || ''); }}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="publico-quitar" onClick={() => setEditandoTransmision(true)}>
              📺 {partido.url_transmision ? 'Cambiar enlace de transmisión' : 'Agregar enlace de transmisión'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ETIQUETA_SANCION = {
  amarilla: 'Tarjeta amarilla',
  azul: 'Tarjeta azul',
  doble_amarilla: 'Doble amarilla (expulsión)',
  roja_directa: 'Tarjeta roja directa'
};

function formatoMulta(valor) {
  return Number(valor) > 0 ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor) : null;
}

// Jugadores que en este momento no pueden jugar el próximo partido de su equipo
// por una tarjeta, agrupados por equipo. El organizador/admin los habilita acá
// una vez confirma que se pusieron al día con el valor de la sanción — mientras
// haya fechas obligatorias de por medio (doble amarilla o roja directa), no hay
// botón para habilitar todavía: esas hay que cumplirlas sí o sí.
export function SeccionSanciones({ torneoId }) {
  const modal = useModal();
  const [sanciones, setSanciones] = useState([]);
  const [expulsiones, setExpulsiones] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => { if (torneoId) cargar(); }, [torneoId]);

  async function cargar() {
    setCargando(true);
    try {
      const [s, e] = await Promise.all([
        api('/sanciones?torneo_id=' + torneoId),
        api('/sanciones/expulsiones?torneo_id=' + torneoId)
      ]);
      setSanciones(s);
      setExpulsiones(e);
    } finally {
      setCargando(false);
    }
  }

  async function habilitar(s) {
    const confirmado = await modal.confirmar({
      titulo: `¿Habilitar a ${s.jugadorNombre}?`,
      mensaje: 'Confirma que el jugador ya se puso al día con el valor de la sanción.',
      textoAceptar: 'Habilitar'
    });
    if (!confirmado) return;
    try {
      await api(`/sanciones/${s.tarjetaId}/habilitar`, { method: 'POST' });
      await cargar();
    } catch (err) {
      await modal.error(err.message, 'No se pudo habilitar al jugador');
    }
  }

  async function confirmarPago(ex) {
    const confirmado = await modal.confirmar({
      titulo: `¿Confirmar el pago de la multa de "${ex.equipoNombre}"?`,
      mensaje: 'El equipo vuelve a poder jugar. El jugador expulsado sigue vetado el resto del campeonato — eso no se revierte.',
      textoAceptar: 'Confirmar pago'
    });
    if (!confirmado) return;
    try {
      await api(`/sanciones/expulsion/${ex.id}/pagar`, { method: 'POST' });
      await cargar();
    } catch (err) {
      await modal.error(err.message, 'No se pudo confirmar el pago');
    }
  }

  if (!torneoId) {
    return (
      <section className="admin-card">
        <h2>Sanciones por tarjeta (deportivas)</h2>
        <p className="admin-empty">Elige o crea un campeonato primero.</p>
      </section>
    );
  }
  if (cargando) return null;

  const porEquipo = new Map();
  for (const s of sanciones) {
    if (!porEquipo.has(s.equipoNombre)) porEquipo.set(s.equipoNombre, []);
    porEquipo.get(s.equipoNombre).push(s);
  }

  return (
    <section className="admin-card">
      <h2>Sanciones por tarjeta (deportivas)</h2>
      {sanciones.length === 0 && <p className="admin-empty">No hay jugadores sancionados en este momento.</p>}
      {[...porEquipo.entries()].map(([equipoNombre, lista]) => (
        <div key={equipoNombre} className="admin-sancion-equipo">
          <span className="subida-imagen-label">{equipoNombre}</span>
          <div className="admin-list admin-list--alta">
            {lista.map((s) => (
              <div key={s.tarjetaId} className="admin-item admin-item--estatico">
                <span>
                  <strong>{s.jugadorNombre}</strong>
                  <small>
                    {ETIQUETA_SANCION[s.tipoSancion]} — no disponible para la Jornada {s.proximaFechaBloqueada}
                    {formatoMulta(s.multa) && ` — multa: ${formatoMulta(s.multa)}`}
                  </small>
                </span>
                {s.requierePago && (
                  <button type="button" className="admin-btn-editar" onClick={() => habilitar(s)}>Habilitar (ya pagó)</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2>Expulsiones del campeonato</h2>
      {expulsiones.length === 0 && <p className="admin-empty">No hay jugadores expulsados.</p>}
      <div className="admin-list admin-list--alta">
        {expulsiones.map((ex) => (
          <div key={ex.id} className="admin-item admin-item--estatico">
            <span>
              <strong>{ex.jugadorNombre}</strong> <small>({ex.equipoNombre})</small>
              <small>
                {ex.motivo}
                {formatoMulta(ex.multa) && ` — multa al equipo: ${formatoMulta(ex.multa)}`}
              </small>
            </span>
            {ex.pagado ? (
              <span className="admin-estado admin-estado--aprobado">Multa pagada</span>
            ) : (
              <>
                <span className="admin-estado admin-estado--rechazado">Equipo bloqueado — no puede jugar</span>
                <button type="button" className="admin-btn-editar" onClick={() => confirmarPago(ex)}>Confirmar pago</button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// DISCIPLINA: sanciones administrativas "de oficio" por conductas EXTRADEPORTIVAS
// (no vistas en el partido) — módulo aparte de las sanciones por tarjeta de
// arriba, que no se tocan. Ya está protegido a nivel de ruta (/admin/fixture y
// /admin/campeonatos son solo admin/organizador — el árbitro nunca llega acá).
export function SeccionDisciplina({ torneoId }) {
  const modal = useModal();
  const [equipos, setEquipos] = useState([]);
  const [jugadoresPorEquipo, setJugadoresPorEquipo] = useState({});
  const [sancionesJugador, setSancionesJugador] = useState([]);
  const [sancionesEquipo, setSancionesEquipo] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [formJugador, setFormJugador] = useState({ equipo_id: '', jugador_id: '', motivo: '', fechas: '', multa: '' });
  const [formEquipo, setFormEquipo] = useState({ equipo_id: '', motivo: '', multa: '' });
  const [guardandoJugador, setGuardandoJugador] = useState(false);
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);

  useEffect(() => { if (torneoId) cargar(); }, [torneoId]);

  async function cargar() {
    setCargando(true);
    try {
      const [eq, sj, se] = await Promise.all([
        api('/equipos?torneo_id=' + torneoId),
        api('/sanciones/disciplina/jugador?torneo_id=' + torneoId),
        api('/sanciones/disciplina/equipo?torneo_id=' + torneoId)
      ]);
      setEquipos(eq.filter((e) => e.estado === 'aprobado' && e.estado_torneo === 'activo'));
      setSancionesJugador(sj);
      setSancionesEquipo(se);
    } finally {
      setCargando(false);
    }
  }

  async function jugadoresDe(equipoId) {
    if (!equipoId || jugadoresPorEquipo[equipoId]) return;
    const data = await api('/jugadores?equipo_id=' + equipoId);
    setJugadoresPorEquipo((m) => ({ ...m, [equipoId]: data }));
  }

  async function crearSancionJugador(e) {
    e.preventDefault();
    if (!formJugador.jugador_id || !formJugador.motivo.trim()) return;
    if (!(Number(formJugador.fechas) > 0) && !(Number(formJugador.multa) > 0)) {
      await modal.error('La sanción debe llevar fechas de suspensión, multa, o ambas.');
      return;
    }
    setGuardandoJugador(true);
    try {
      await api('/sanciones/disciplina/jugador', {
        method: 'POST',
        body: JSON.stringify({
          jugador_id: Number(formJugador.jugador_id), motivo: formJugador.motivo.trim(),
          fechas: Number(formJugador.fechas) || 0, multa: Number(formJugador.multa) || 0
        })
      });
      setFormJugador({ equipo_id: '', jugador_id: '', motivo: '', fechas: '', multa: '' });
      await cargar();
      await modal.exito('La sanción quedó registrada.');
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar la sanción');
    } finally {
      setGuardandoJugador(false);
    }
  }

  async function expulsarJugadorDeOficio() {
    if (!formJugador.jugador_id) return;
    const jugador = (jugadoresPorEquipo[formJugador.equipo_id] || []).find((j) => String(j.id) === String(formJugador.jugador_id));
    const resultado = await modal.expulsarJugador({
      titulo: `¿Expulsar a ${jugador?.nombre || 'este jugador'} del campeonato?`,
      mensaje: 'Esto es para faltas disciplinarias graves (ej. agresión a un árbitro) donde una tarjeta no alcanza. El jugador queda vetado el resto del campeonato, y su equipo NO podrá jugar ningún partido más hasta que se confirme el pago de la multa.'
    });
    if (!resultado) return;
    try {
      await api('/sanciones/expulsar', {
        method: 'POST',
        body: JSON.stringify({ jugador_id: Number(formJugador.jugador_id), motivo: resultado.motivo, multa: resultado.multa })
      });
      setFormJugador({ equipo_id: '', jugador_id: '', motivo: '', fechas: '', multa: '' });
      await cargar();
      await modal.exito(`${jugador?.nombre || 'El jugador'} quedó expulsado del campeonato. Su equipo está bloqueado hasta que se pague la multa.`);
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar la expulsión');
    }
  }

  async function pagarSancionJugador(s) {
    const confirmado = await modal.confirmar({
      titulo: `¿Confirmar el pago de la multa de "${s.jugadorNombre}"?`,
      mensaje: 'El equipo vuelve a poder jugar.',
      textoAceptar: 'Confirmar pago'
    });
    if (!confirmado) return;
    try {
      await api(`/sanciones/disciplina/jugador/${s.id}/pagar`, { method: 'POST' });
      await cargar();
    } catch (err) {
      await modal.error(err.message, 'No se pudo confirmar el pago');
    }
  }

  async function crearSancionEquipo(e) {
    e.preventDefault();
    if (!formEquipo.equipo_id || !formEquipo.motivo.trim() || !(Number(formEquipo.multa) > 0)) return;
    setGuardandoEquipo(true);
    try {
      await api('/sanciones/disciplina/equipo', {
        method: 'POST',
        body: JSON.stringify({ equipo_id: Number(formEquipo.equipo_id), motivo: formEquipo.motivo.trim(), multa: Number(formEquipo.multa) })
      });
      setFormEquipo({ equipo_id: '', motivo: '', multa: '' });
      await cargar();
      await modal.exito('La sanción económica quedó registrada.');
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar la sanción');
    } finally {
      setGuardandoEquipo(false);
    }
  }

  async function pagarSancionEquipo(s) {
    const confirmado = await modal.confirmar({
      titulo: `¿Confirmar el pago de la multa de "${s.equipoNombre}"?`,
      mensaje: 'El equipo vuelve a poder jugar.',
      textoAceptar: 'Confirmar pago'
    });
    if (!confirmado) return;
    try {
      await api(`/sanciones/disciplina/equipo/${s.id}/pagar`, { method: 'POST' });
      await cargar();
    } catch (err) {
      await modal.error(err.message, 'No se pudo confirmar el pago');
    }
  }

  async function expulsarEquipoDeOficio(equipo) {
    const motivo = await modal.preguntar({
      titulo: `¿Expulsar de oficio a "${equipo.nombre}" del campeonato?`,
      mensaje: 'Esto es por una falta disciplinaria (no por inasistencias). Los partidos de liga o de grupos que todavía no se hayan jugado quedan automáticamente 3-0 a favor del rival (walkover). Indica el motivo.',
      placeholder: 'Ej: agresión colectiva a un árbitro',
      textoAceptar: 'Expulsar del campeonato'
    });
    if (!motivo) return;
    try {
      const resultado = await api(`/equipos/${equipo.id}/baja`, { method: 'PATCH', body: JSON.stringify({ tipo: 'descalificado', motivo }) });
      let mensaje = `${equipo.nombre} quedó expulsado del campeonato.`;
      if (resultado.walkoversAplicados > 0) mensaje += ` Se le dieron por perdidos ${resultado.walkoversAplicados} partido(s) pendiente(s) (3-0).`;
      await cargar();
      await modal.exito(mensaje);
    } catch (err) {
      await modal.error(err.message, 'No se pudo expulsar al equipo');
    }
  }

  if (!torneoId) {
    return (
      <section className="admin-card">
        <h2>Disciplina</h2>
        <p className="admin-empty">Elige o crea un campeonato primero.</p>
      </section>
    );
  }
  if (cargando) return null;

  return (
    <section className="admin-card">
      <h2>Disciplina</h2>
      <p className="admin-ayuda">Sanciones de oficio por conductas extradeportivas (no vistas en el partido). Las sanciones por tarjeta (más arriba, en "Sanciones por tarjeta (deportivas)") se configuran y se muestran aparte — acá no se tocan.</p>

      <h3>Sancionar a un jugador</h3>
      <form onSubmit={crearSancionJugador} className="admin-form">
        <div className="admin-form-row">
          <label>Equipo
            <select
              value={formJugador.equipo_id}
              onChange={(e) => { setFormJugador({ ...formJugador, equipo_id: e.target.value, jugador_id: '' }); jugadoresDe(e.target.value); }}
              required
            >
              <option value="">Selecciona un equipo</option>
              {equipos.map((eq) => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
            </select>
          </label>
          <label>Jugador
            <select
              value={formJugador.jugador_id}
              onChange={(e) => setFormJugador({ ...formJugador, jugador_id: e.target.value })}
              disabled={!formJugador.equipo_id}
              required
            >
              <option value="">Selecciona un jugador</option>
              {(jugadoresPorEquipo[formJugador.equipo_id] || []).map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
            </select>
          </label>
        </div>
        <label>Motivo
          <textarea value={formJugador.motivo} onChange={(e) => setFormJugador({ ...formJugador, motivo: e.target.value })} placeholder="Ej: agresión a un árbitro fuera del partido" required />
        </label>
        <div className="admin-form-row">
          <label>Fechas de suspensión (opcional)
            <input type="number" min="0" max="10" value={formJugador.fechas} onChange={(e) => setFormJugador({ ...formJugador, fechas: e.target.value })} placeholder="0" />
          </label>
          <label>Multa (opcional)
            <input type="number" min="0" value={formJugador.multa} onChange={(e) => setFormJugador({ ...formJugador, multa: e.target.value })} placeholder="0" />
          </label>
        </div>
        <p className="admin-ayuda">Puedes poner solo fechas, solo multa, o ambas. Mientras haya fechas, el jugador no puede ser convocado en esos partidos (el equipo sigue jugando normal). Si hay multa, el equipo queda bloqueado para jugar hasta que se pague.</p>
        <div className="admin-form-linea">
          <button type="submit" disabled={guardandoJugador}>{guardandoJugador ? 'Guardando...' : '+ Registrar sanción al jugador'}</button>
          <button type="button" className="admin-btn-peligro-oscuro" disabled={!formJugador.jugador_id} onClick={expulsarJugadorDeOficio}>
            ⛔ Expulsar del campeonato (permanente)
          </button>
        </div>
      </form>

      {sancionesJugador.filter((s) => s.activa).length > 0 && (
        <div className="admin-list admin-list--alta">
          {sancionesJugador.filter((s) => s.activa).map((s) => (
            <div key={s.id} className="admin-item admin-item--estatico">
              <span>
                <strong>{s.jugadorNombre}</strong> <small>({s.equipoNombre})</small>
                <small>
                  {s.motivo}
                  {s.partidosBloqueadosIds.length > 0 && ` — no disponible hasta la Jornada ${s.proximaFechaBloqueada}`}
                  {formatoMulta(s.multa) && ` — multa: ${formatoMulta(s.multa)}`}
                </small>
              </span>
              {Number(s.multa) > 0 && (s.pagado ? (
                <span className="admin-estado admin-estado--aprobado">Multa pagada</span>
              ) : (
                <>
                  <span className="admin-estado admin-estado--rechazado">Equipo bloqueado</span>
                  <button type="button" className="admin-btn-editar" onClick={() => pagarSancionJugador(s)}>Confirmar pago</button>
                </>
              ))}
            </div>
          ))}
        </div>
      )}

      <h3>Sancionar a un equipo (multa económica)</h3>
      <form onSubmit={crearSancionEquipo} className="admin-form">
        <div className="admin-form-row">
          <label>Equipo
            <select value={formEquipo.equipo_id} onChange={(e) => setFormEquipo({ ...formEquipo, equipo_id: e.target.value })} required>
              <option value="">Selecciona un equipo</option>
              {equipos.map((eq) => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
            </select>
          </label>
          <label>Multa
            <input type="number" min="1" value={formEquipo.multa} onChange={(e) => setFormEquipo({ ...formEquipo, multa: e.target.value })} required />
          </label>
        </div>
        <label>Motivo
          <textarea value={formEquipo.motivo} onChange={(e) => setFormEquipo({ ...formEquipo, motivo: e.target.value })} placeholder="Ej: incidentes con la hinchada" required />
        </label>
        <p className="admin-ayuda">Por ahora la sanción a un equipo es solo económica — mientras esté sin pagar, el equipo no puede jugar. Si la falta amerita expulsarlo del campeonato, usa el botón "Expulsar del campeonato" junto al equipo.</p>
        <button type="submit" disabled={guardandoEquipo}>{guardandoEquipo ? 'Guardando...' : '+ Registrar sanción al equipo'}</button>
      </form>

      {sancionesEquipo.length > 0 && (
        <div className="admin-list admin-list--alta">
          {sancionesEquipo.map((s) => (
            <div key={s.id} className="admin-item admin-item--estatico">
              <span>
                <strong>{s.equipoNombre}</strong>
                <small>{s.motivo} — multa: {formatoMulta(s.multa)}</small>
              </span>
              {s.pagado ? (
                <span className="admin-estado admin-estado--aprobado">Multa pagada</span>
              ) : (
                <>
                  <span className="admin-estado admin-estado--rechazado">Equipo bloqueado</span>
                  <button type="button" className="admin-btn-editar" onClick={() => pagarSancionEquipo(s)}>Confirmar pago</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <h3>Expulsar un equipo del campeonato (de oficio)</h3>
      <p className="admin-ayuda">Distinto de la descalificación automática por 2 inasistencias: esto es para faltas disciplinarias graves. Los partidos pendientes de liga/grupos quedan 3-0 a favor del rival.</p>
      <div className="admin-list admin-list--alta">
        {equipos.map((eq) => (
          <div key={eq.id} className="admin-item admin-item--estatico">
            <span><strong>{eq.nombre}</strong></span>
            <button type="button" className="admin-btn-peligro-oscuro" onClick={() => expulsarEquipoDeOficio(eq)}>⛔ Expulsar del campeonato</button>
          </div>
        ))}
      </div>
    </section>
  );
}
