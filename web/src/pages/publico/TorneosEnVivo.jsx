import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { nombreModalidad } from '../../lib/modalidad';
import { activarSonido, usePitidos } from '../../lib/pitido';
import { useFilasAbiertas } from '../../lib/useFilasAbiertas';
import CargaJugador from '../../components/CargaJugador';
import FilaPartidoPublico from '../../components/FilaPartidoPublico';
import AvisosPito from '../../components/AvisosPito';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import { registrarVisita } from '../../lib/visitas';

// Junta los partidos (liga + fases) de UN torneo, igual que en la página de un
// solo campeonato, pero acá se hace para cada torneo del hub y se etiqueta cada
// partido con a cuál pertenece (para cuando hay varios jugándose al mismo tiempo).
async function cargarPartidosDe(torneo) {
  const lista = [];
  if (torneo.formato === 'liga') {
    const liga = await api('/partidos?torneo_id=' + torneo.id);
    lista.push(...liga.map((p) => ({ ...p, contexto: 'Liga' })));
  }
  const fases = await api('/fases?torneo_id=' + torneo.id);
  for (const fase of fases) {
    const ps = await api(`/fases/${fase.id}/partidos`);
    lista.push(...ps.map((p) => ({ ...p, contexto: fase.tipo === 'grupos' ? 'Grupos' : (p.ronda_nombre || 'Eliminatoria') })));
  }
  return lista
    .filter((p) => p.equipo_local_id && p.equipo_visitante_id)
    .map((p) => ({ ...p, _torneoNombre: torneo.nombre, _torneoLogo: torneo.logo_url, _torneoSlug: torneo.slug }));
}

function BandaTorneo({ torneo }) {
  return (
    <Link to={`/en-vivo/${torneo.slug}`} className="publico-torneo-banda">
      {torneo.logo_url ? <img src={torneo.logo_url} alt="" /> : <span className="publico-torneo-banda-logo-vacio" />}
      <span className="publico-torneo-banda-info">
        <span className="publico-torneo-banda-nombre">{torneo.nombre}</span>
        <span className="publico-torneo-banda-modalidad">{nombreModalidad(torneo.modalidad)}</span>
      </span>
      <EstadoCampeonato estado={torneo.estado} />
    </Link>
  );
}

export default function TorneosEnVivo() {
  const [torneos, setTorneos] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [verFinalizados, setVerFinalizados] = useState(false);
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const { avisos, procesar, anunciar } = usePitidos();
  const { estaAbierto, alternarAbierto, alternarFijado, estaFijado } = useFilasAbiertas();

  useEffect(() => { registrarVisita('en_vivo'); }, []);

  useEffect(() => {
    let activo = true;

    async function cargarTodo() {
      const listaTorneos = await api('/publico/torneos');
      if (!activo) return;
      setTorneos(listaTorneos);

      // Los partidos de un torneo ya finalizado no aparecen en este hub (su
      // historial completo vive en la página propia del torneo), así que ni
      // siquiera hace falta pedirlos acá — importa a medida que se acumulan
      // campeonatos con el tiempo. Excepción: si se finalizó justo HOY (ej. se
      // jugó la final), sus partidos de hoy se siguen pidiendo para que el
      // último partido no desaparezca de este hub antes de que cambie el día.
      const hoyStr = new Date().toDateString();
      const activos = listaTorneos.filter((t) =>
        t.estado !== 'finalizado' || (t.fecha_finalizado && new Date(t.fecha_finalizado).toDateString() === hoyStr)
      );
      const porTorneo = await Promise.all(activos.map(cargarPartidosDe));
      if (!activo) return;
      const todos = porTorneo.flat();

      procesar(todos);
      setPartidos(todos);
      setCargando(false);
    }

    cargarTodo();
    const id = setInterval(cargarTodo, 10000);
    return () => { activo = false; clearInterval(id); };
  }, []);

  if (cargando) return <CargaJugador texto="Cargando los campeonatos..." />;

  const hoy = new Date().toDateString();
  const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();
  const esDia = (p, dia) => p.fecha_hora && new Date(p.fecha_hora).toDateString() === dia;
  const porFecha = (a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0);

  const enVivo = partidos.filter((p) => p.estado === 'en_curso');
  // El partido de hoy se queda visible aunque ya haya terminado — recién
  // desaparece de esta vista cuando cambia el día (su historial completo sigue
  // disponible en la página propia del torneo).
  const deHoy = partidos.filter((p) => p.estado !== 'en_curso' && esDia(p, hoy)).sort(porFecha);
  const deManana = partidos.filter((p) => p.estado !== 'en_curso' && esDia(p, manana)).sort(porFecha);

  const torneosActivos = torneos.filter((t) => t.estado !== 'finalizado');
  const torneosFinalizados = torneos.filter((t) => t.estado === 'finalizado');

  function fila(p) {
    return (
      <FilaPartidoPublico
        key={p.id} partido={p} abierto={estaAbierto(p.id)} onAbrir={alternarAbierto}
        fijado={estaFijado(p.id)} onFijar={alternarFijado} onEvento={anunciar}
        torneoNombre={p._torneoNombre} torneoLogo={p._torneoLogo}
      />
    );
  }

  return (
    <div className="publico-partido-page">
      <AvisosPito avisos={avisos} />
      <Link to="/" className="publico-en-vivo-volver">← Inicio</Link>
      <div className="publico-en-vivo-cabecera">
        <h1>Campeonatos en vivo</h1>
        <span className="publico-en-vivo-modalidad">Todos los resultados, en un solo lugar</span>
        <button
          type="button"
          className={'publico-en-vivo-sonido' + (sonidoActivo ? ' publico-en-vivo-sonido--activo' : '')}
          onClick={() => { activarSonido(); setSonidoActivo(true); }}
        >
          {sonidoActivo ? '🔊 Pitidos activados' : '🔈 Activar pitidos en vivo'}
        </button>
      </div>

      {torneos.length > 1 && (
        <>
          <h2 className="publico-en-vivo-seccion">Campeonatos</h2>
          <div className="publico-torneo-bandas">
            {torneosActivos.map((t) => <BandaTorneo key={t.id} torneo={t} />)}

            {verFinalizados && torneosFinalizados.map((t) => <BandaTorneo key={t.id} torneo={t} />)}

            {torneosFinalizados.length > 0 && (
              <button type="button" className="publico-torneo-banda-vermas" onClick={() => setVerFinalizados((v) => !v)}>
                {verFinalizados ? '▲ Ver menos' : `▼ Ver campeonatos finalizados (${torneosFinalizados.length})`}
              </button>
            )}
          </div>
        </>
      )}

      <div className="publico-en-vivo-lista">
        {enVivo.length > 0 && (
          <div className="publico-en-vivo-bloque-vivo">
            <h2 className="publico-en-vivo-seccion publico-en-vivo-seccion--vivo"><span className="publico-en-vivo-punto" /> En vivo</h2>
            {enVivo.map((p) => fila(p))}
          </div>
        )}
        <h2 className="publico-en-vivo-seccion">Partido del día</h2>
        {deHoy.length === 0 && <p className="admin-empty">No hay ningún partido programado todavía.</p>}
        {deHoy.map((p) => fila(p))}

        {deManana.length > 0 && (
          <>
            <h2 className="publico-en-vivo-seccion">Mañana</h2>
            {deManana.map((p) => fila(p))}
          </>
        )}
      </div>
    </div>
  );
}
