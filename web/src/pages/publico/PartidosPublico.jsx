import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { nombreModalidad } from '../../lib/modalidad';
import { activarSonido, usePitidos } from '../../lib/pitido';
import { useFilasAbiertas } from '../../lib/useFilasAbiertas';
import CargaJugador from '../../components/CargaJugador';
import FilaPartidoPublico from '../../components/FilaPartidoPublico';
import AvisosPito from '../../components/AvisosPito';
import CuadroBracket from '../../components/CuadroBracket';
import { registrarVisita } from '../../lib/visitas';

function TablaGoleadores({ goleadores }) {
  if (goleadores.length === 0) return <p className="admin-empty">Todavía no hay goles registrados.</p>;
  return (
    <div className="imprimir-tabla-scroll">
      <table className="imprimir-tabla">
        <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
        <tbody>
          {goleadores.map((g, i) => (
            <tr key={g.jugador_id}><td>{i + 1}</td><td>{g.jugador_nombre}</td><td>{g.equipo_nombre}</td><td>{g.goles}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaVallaMenosVencida({ equipos }) {
  if (equipos.length === 0) return <p className="admin-empty">Todavía no hay partidos jugados.</p>;
  return (
    <div className="imprimir-tabla-scroll">
      <table className="imprimir-tabla">
        <thead><tr><th>#</th><th></th><th>Equipo</th><th>PJ</th><th>GC</th></tr></thead>
        <tbody>
          {equipos.map((e, i) => (
            <tr key={e.equipo_id}>
              <td>{i + 1}</td>
              <td className="imprimir-tabla-escudo">{e.escudo_url ? <img src={e.escudo_url} alt="" /> : <span className="imprimir-escudo-vacio" />}</td>
              <td>{e.nombre}</td><td>{e.pj}</td><td>{e.gc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaHistoricoSanciones({ sanciones }) {
  if (sanciones.length === 0) return <p className="admin-empty">Todavía no hay tarjetas registradas.</p>;
  return (
    <>
      <p className="admin-ayuda">Tarjetas acumuladas de cada jugador a lo largo de todo el campeonato.</p>
      <div className="imprimir-tabla-scroll">
        <table className="imprimir-tabla">
          <thead><tr><th>Jugador</th><th>Equipo</th><th>🟨</th><th>🟥</th><th>🟦</th></tr></thead>
          <tbody>
            {sanciones.map((s) => (
              <tr key={s.jugador_id}>
                <td>{s.jugador_nombre}</td><td>{s.equipo_nombre}</td>
                <td>{s.amarillas || ''}</td><td>{s.rojas || ''}</td><td>{s.azules || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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

// Jugadores que en este momento no pueden jugar el próximo partido de su equipo,
// agrupados por equipo — para que cualquiera pueda ver quién está sancionado y
// por qué, aunque solo el organizador/admin pueda habilitarlos.
function SancionesActivas({ sanciones }) {
  if (sanciones.length === 0) return <p className="admin-empty">No hay jugadores sancionados en este momento.</p>;

  const porEquipo = new Map();
  for (const s of sanciones) {
    if (!porEquipo.has(s.equipoNombre)) porEquipo.set(s.equipoNombre, []);
    porEquipo.get(s.equipoNombre).push(s);
  }

  return (
    <>
      {[...porEquipo.entries()].map(([equipoNombre, lista]) => (
        <div key={equipoNombre} className="publico-en-vivo-grupo">
          <h3>{equipoNombre}</h3>
          <div className="publico-sancion-lista">
            {lista.map((s) => (
              <div key={s.tarjetaId} className="publico-sancion-fila">
                <strong>{s.jugadorNombre}</strong>
                <span>
                  {ETIQUETA_SANCION[s.tipoSancion]} — no disponible para la Jornada {s.proximaFechaBloqueada}
                  {formatoMulta(s.multa) && ` — multa: ${formatoMulta(s.multa)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// Jugadores expulsados definitivamente del campeonato y si el equipo ya se puso
// al día con la multa — información pública para que todos sepan por qué un
// equipo no está jugando.
function ExpulsionesActivas({ expulsiones }) {
  if (expulsiones.length === 0) return null;
  return (
    <div className="publico-en-vivo-grupo">
      <h3>Expulsiones del campeonato</h3>
      <div className="publico-sancion-lista">
        {expulsiones.map((ex) => (
          <div key={ex.id} className="publico-sancion-fila">
            <strong>{ex.jugadorNombre} <small>({ex.equipoNombre})</small></strong>
            <span>
              {ex.motivo}
              {' — '}{ex.pagado ? 'multa pagada, el equipo ya puede jugar' : 'equipo bloqueado hasta que se pague la multa'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TablaPosicionesPublica({ fila }) {
  const hayEnVivo = fila.some((f) => f.en_vivo);
  return (
    <>
      {hayEnVivo && (
        <p className="publico-en-vivo-nota-tabla">
          ● Los equipos marcados están jugando ahora — su posición y puntos ya incluyen lo que va del partido y se ajustan solos cuando termine.
        </p>
      )}
      <div className="imprimir-tabla-scroll">
        <table className="imprimir-tabla">
          <thead>
            <tr>
              <th>#</th><th></th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th>
            </tr>
          </thead>
          <tbody>
            {fila.map((f, i) => (
              <tr key={f.equipo_id} className={f.en_vivo ? 'imprimir-tabla-fila-vivo' : ''}>
                <td>{i + 1}</td>
                <td className="imprimir-tabla-escudo">
                  {f.escudo_url ? <img src={f.escudo_url} alt="" /> : <span className="imprimir-escudo-vacio" />}
                </td>
                <td>{f.nombre}{f.en_vivo && ' ●'}{f.estado_torneo === 'descalificado' && ' (descalificado)'}</td>
                <td>{f.pj}</td><td>{f.pg}</td><td>{f.pe}</td><td>{f.pp}</td>
                <td>{f.gf}</td><td>{f.gc}</td><td>{f.dif}</td><td>{f.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PartidosPublico() {
  const { slug } = useParams();
  const [torneo, setTorneo] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [tablas, setTablas] = useState(null);
  const [cuadroPartidos, setCuadroPartidos] = useState(null);
  const [stats, setStats] = useState(null);
  const [sanciones, setSanciones] = useState([]);
  const [expulsiones, setExpulsiones] = useState([]);
  const [pestana, setPestana] = useState('partidos');
  const [subPestana, setSubPestana] = useState('goleadores');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const { avisos, procesar, anunciar } = usePitidos();
  const { estaAbierto, alternarAbierto, alternarFijado, estaFijado } = useFilasAbiertas();

  useEffect(() => {
    let activo = true;
    let primeraCarga = true;

    async function cargarTodo() {
      let t;
      try {
        t = await api(`/publico/torneos/${slug}`);
      } catch (err) {
        if (activo) { setError(err.message); setCargando(false); }
        return;
      }
      if (!activo) return;
      setTorneo(t);
      // Solo se cuenta la primera vez — esto se repite cada 10s para
      // mantener los resultados al día, no cada poll es una visita nueva.
      if (primeraCarga) { registrarVisita('campeonato', t.id); primeraCarga = false; }

      const lista = [];
      if (t.formato === 'liga') {
        const liga = await api('/partidos?torneo_id=' + t.id);
        lista.push(...liga.map((p) => ({ ...p, contexto: 'Liga' })));
      }
      const fases = await api('/fases?torneo_id=' + t.id);
      let partidosEliminatoria = null;
      for (const fase of fases) {
        const ps = await api(`/fases/${fase.id}/partidos`);
        lista.push(...ps.map((p) => ({ ...p, contexto: fase.tipo === 'grupos' ? 'Grupos' : (p.ronda_nombre || 'Eliminatoria') })));
        if (fase.tipo === 'eliminacion') partidosEliminatoria = ps;
      }
      const conEquipos = lista.filter((p) => p.equipo_local_id && p.equipo_visitante_id);
      if (!activo) return;

      procesar(conEquipos);
      setPartidos(conEquipos);
      setCuadroPartidos(partidosEliminatoria);

      if (t.formato === 'liga') {
        const tabla = await api('/partidos/posiciones?torneo_id=' + t.id + '&en_vivo=1');
        if (activo) setTablas([{ grupo_id: null, grupo_nombre: null, tabla }]);
      } else {
        const faseGrupos = fases.find((f) => f.tipo === 'grupos');
        if (faseGrupos) {
          const tabs = await api(`/fases/${faseGrupos.id}/posiciones?en_vivo=1`);
          if (activo) setTablas(tabs);
        }
      }

      const est = await api(`/torneos/${t.id}/estadisticas`);
      if (activo) setStats(est);

      const sancionesActivas = await api(`/publico/torneos/${slug}/sanciones`);
      if (activo) setSanciones(sancionesActivas);

      const expulsionesActivas = await api(`/publico/torneos/${slug}/expulsiones`);
      if (activo) setExpulsiones(expulsionesActivas);

      setCargando(false);
    }

    cargarTodo();
    const id = setInterval(cargarTodo, 10000);
    return () => { activo = false; clearInterval(id); };
  }, [slug]);

  if (error) {
    return (
      <div className="publico-partido-page">
        <p className="admin-empty">No se pudo cargar este campeonato: {error}</p>
        <Link to="/en-vivo" className="publico-en-vivo-volver">← Ver todos los campeonatos</Link>
      </div>
    );
  }
  if (cargando || !torneo) return <CargaJugador texto="Cargando el campeonato..." />;

  const hoy = new Date().toDateString();
  const esHoy = (p) => p.fecha_hora && new Date(p.fecha_hora).toDateString() === hoy;
  const enVivo = partidos.filter((p) => p.estado === 'en_curso');
  const deHoy = partidos.filter((p) => p.estado !== 'en_curso' && p.estado !== 'jugado' && esHoy(p));
  const jugados = partidos.filter((p) => p.estado === 'jugado')
    .sort((a, b) => new Date(b.jugado_hasta || b.fecha_hora || 0) - new Date(a.jugado_hasta || a.fecha_hora || 0));

  return (
    <div className="publico-partido-page">
      <AvisosPito avisos={avisos} />
      <Link to="/en-vivo" className="publico-en-vivo-volver">← Ver todos los campeonatos</Link>
      <div className="publico-en-vivo-cabecera">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" className="publico-en-vivo-logo" />}
        <h1>{torneo.nombre}</h1>
        <span className="publico-en-vivo-modalidad">{nombreModalidad(torneo.modalidad)}</span>
        <button
          type="button"
          className={'publico-en-vivo-sonido' + (sonidoActivo ? ' publico-en-vivo-sonido--activo' : '')}
          onClick={() => { activarSonido(); setSonidoActivo(true); }}
        >
          {sonidoActivo ? '🔊 Pitidos activados' : '🔈 Activar pitidos en vivo'}
        </button>
      </div>

      {torneo.estado_inscripciones === 'abierta' && (
        <Link to={`/inscripcion/${torneo.slug}`} className="publico-inscribete-banner">
          📝 Las inscripciones están abiertas — <strong>Inscribe tu equipo</strong>
        </Link>
      )}

      <div className="publico-en-vivo-pestanas">
        <button type="button" className={pestana === 'partidos' ? 'activa' : ''} onClick={() => setPestana('partidos')}>Partidos</button>
        <button type="button" className={pestana === 'posiciones' ? 'activa' : ''} onClick={() => setPestana('posiciones')}>Posiciones</button>
        <button type="button" className={pestana === 'estadisticas' ? 'activa' : ''} onClick={() => setPestana('estadisticas')}>Estadísticas</button>
        <button type="button" className={pestana === 'sanciones' ? 'activa' : ''} onClick={() => setPestana('sanciones')}>Sanciones</button>
      </div>

      {pestana === 'partidos' && (
        <div className="publico-en-vivo-lista">
          {enVivo.length > 0 && (
            <div className="publico-en-vivo-bloque-vivo">
              <h2 className="publico-en-vivo-seccion publico-en-vivo-seccion--vivo"><span className="publico-en-vivo-punto" /> En vivo</h2>
              {enVivo.map((p) => (
                <FilaPartidoPublico
                  key={p.id} partido={p} abierto={estaAbierto(p.id)} onAbrir={alternarAbierto}
                  fijado={estaFijado(p.id)} onFijar={alternarFijado} onEvento={anunciar}
                />
              ))}
            </div>
          )}
          <h2 className="publico-en-vivo-seccion">Partido del día</h2>
          {deHoy.length === 0 && <p className="admin-empty">No hay más partidos programados para hoy.</p>}
          {deHoy.map((p) => (
            <FilaPartidoPublico
              key={p.id} partido={p} abierto={estaAbierto(p.id)} onAbrir={alternarAbierto}
              fijado={estaFijado(p.id)} onFijar={alternarFijado} onEvento={anunciar}
            />
          ))}

          <h2 className="publico-en-vivo-seccion">Ya jugados</h2>
          {jugados.length === 0 && <p className="admin-empty">Todavía no hay partidos jugados.</p>}
          {jugados.map((p) => (
            <FilaPartidoPublico
              key={p.id} partido={p} abierto={estaAbierto(p.id)} onAbrir={alternarAbierto}
              fijado={estaFijado(p.id)} onFijar={alternarFijado} onEvento={anunciar}
            />
          ))}
        </div>
      )}

      {pestana === 'posiciones' && (
        <div className="publico-en-vivo-posiciones">
          {!tablas && <p className="admin-empty">Este campeonato todavía no tiene tabla de posiciones.</p>}
          {tablas && tablas.map((g) => (
            <div key={g.grupo_id ?? 'general'} className="publico-en-vivo-grupo">
              {g.grupo_nombre && <h3>Grupo {g.grupo_nombre}</h3>}
              <TablaPosicionesPublica fila={g.tabla} />
            </div>
          ))}
        </div>
      )}

      {pestana === 'estadisticas' && (
        <div className="publico-en-vivo-posiciones">
          <div className="publico-en-vivo-subpestanas">
            <button type="button" className={subPestana === 'goleadores' ? 'activa' : ''} onClick={() => setSubPestana('goleadores')}>Goleadores</button>
            <button type="button" className={subPestana === 'valla' ? 'activa' : ''} onClick={() => setSubPestana('valla')}>Valla menos vencida</button>
            {cuadroPartidos && cuadroPartidos.length > 0 && (
              <button type="button" className={subPestana === 'cuadro' ? 'activa' : ''} onClick={() => setSubPestana('cuadro')}>Cuadro eliminatorio</button>
            )}
            <button type="button" className={subPestana === 'sanciones' ? 'activa' : ''} onClick={() => setSubPestana('sanciones')}>Histórico sanciones</button>
          </div>

          {subPestana === 'goleadores' && (!stats ? <CargaJugador texto="Cargando..." /> : <TablaGoleadores goleadores={stats.goleadores} />)}

          {subPestana === 'valla' && (
            !tablas ? <p className="admin-empty">Este campeonato todavía no tiene tabla de posiciones.</p> :
            tablas.map((g) => (
              <div key={g.grupo_id ?? 'general'} className="publico-en-vivo-grupo">
                {g.grupo_nombre && <h3>Grupo {g.grupo_nombre}</h3>}
                <TablaVallaMenosVencida equipos={[...g.tabla].sort((a, b) => a.gc - b.gc || a.dif - b.dif)} />
              </div>
            ))
          )}

          {subPestana === 'cuadro' && <CuadroBracket partidos={cuadroPartidos || []} />}

          {subPestana === 'sanciones' && (!stats ? <CargaJugador texto="Cargando..." /> : <TablaHistoricoSanciones sanciones={stats.sanciones} />)}
        </div>
      )}

      {pestana === 'sanciones' && (
        <div className="publico-en-vivo-posiciones">
          <SancionesActivas sanciones={sanciones} />
          <ExpulsionesActivas expulsiones={expulsiones} />
        </div>
      )}
    </div>
  );
}
