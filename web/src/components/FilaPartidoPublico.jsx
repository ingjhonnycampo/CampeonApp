import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import LineaTiempoPartido from './LineaTiempoPartido';
import RelojConAdicion from './RelojConAdicion';
import { useConfiguracion } from '../context/ConfiguracionContext';
import { urlEmbebible } from '../lib/embedVideo';

const ICONO_TARJETA = { amarilla: '🟨', roja: '🟥', azul: '🟦' };

const ETIQUETA_TIEMPO = {
  primer_tiempo: 'Primer tiempo',
  descanso: 'Descanso',
  segundo_tiempo: 'Segundo tiempo',
  finalizado: 'Por finalizar'
};

function useRelojEnVivo(partido) {
  const [ahora, setAhora] = useState(Date.now());
  const corriendo = !!partido.cronometro_inicio;

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [corriendo, partido.cronometro_inicio]);

  const segundosCorridos = corriendo ? Math.floor((ahora - new Date(partido.cronometro_inicio).getTime()) / 1000) : 0;
  return (partido.cronometro_acumulado_seg || 0) + segundosCorridos;
}

function EscudoEquipo({ url, nombre }) {
  return url
    ? <img src={url} alt={nombre} className="publico-partido-escudo publico-partido-escudo--chico" />
    : <span className="publico-partido-escudo publico-partido-escudo--chico publico-partido-escudo--vacio" />;
}

// Fila de un partido para las páginas públicas: se puede abrir para ver la línea de
// tiempo completa. torneoNombre/torneoLogo son opcionales — se usan en el hub
// global (donde hay varios campeonatos mezclados) para saber de cuál es cada uno;
// la página de un solo campeonato no los necesita porque ya está en su encabezado.
export default function FilaPartidoPublico({ partido, abierto, onAbrir, fijado, onFijar, torneoNombre, torneoLogo, onEvento }) {
  const totalSeg = useRelojEnVivo(partido);
  const enVivo = partido.estado === 'en_curso';
  const { transmisionHabilitada } = useConfiguracion();
  const [detalle, setDetalle] = useState(null);
  const vistosRef = useRef(null);

  useEffect(() => {
    // Un partido en vivo se sigue consultando en segundo plano aunque esté
    // contraído (para que el pitido siga sonando con cada evento nuevo); uno que
    // ya se jugó o todavía no empieza solo se consulta cuando se abre.
    if (!abierto && !enVivo) return;
    let activo = true;
    async function cargar() {
      const data = await api(`/publico/partidos/${partido.id}`);
      if (!activo) return;

      // Avisa (con pitido) de cualquier gol, tarjeta o cambio nuevo desde la última
      // consulta — no solo los cambios de tiempo, que ya avisa la página que llama
      // a esto. En la primera carga solo se registra lo que ya había, sin pitar.
      if (onEvento && enVivo) {
        const equipos = `${data.partido.equipo_local_nombre} vs ${data.partido.equipo_visitante_nombre}`;
        const eventos = new Map();
        data.goles.forEach((g) => eventos.set(`gol-${g.id}`, () => onEvento(
          `⚽ Gol de ${g.jugador_nombre || 'Jugador'}${g.en_propia_puerta ? ' (en propia puerta)' : ''}`, equipos
        )));
        data.tarjetas.forEach((t) => eventos.set(`tar-${t.id}`, () => onEvento(
          `${ICONO_TARJETA[t.tipo]} Tarjeta ${t.tipo} para ${t.jugador_nombre}`, equipos
        )));
        data.cambios.forEach((c) => eventos.set(`cam-${c.id}`, () => onEvento(
          `🔄 Cambio: sale ${c.jugador_sale_nombre}, entra ${c.jugador_entra_nombre}`, equipos
        )));
        if (vistosRef.current) {
          eventos.forEach((disparar, clave) => { if (!vistosRef.current.has(clave)) disparar(); });
        }
        vistosRef.current = new Set(eventos.keys());
      }

      setDetalle(data);
    }
    cargar();
    const id = enVivo ? setInterval(cargar, 8000) : null;
    return () => { activo = false; if (id) clearInterval(id); };
  }, [abierto, partido.id, enVivo, onEvento]);

  return (
    <div className={'publico-lista-partido' + (enVivo ? ' publico-lista-partido--vivo' : '')}>
      <button type="button" className="publico-lista-partido-cabecera" onClick={() => onAbrir(partido.id)}>
        <span className="publico-lista-partido-fila-superior">
          <span className="publico-lista-partido-contexto">
            {torneoNombre && (
              <span className="publico-lista-partido-torneo">
                {torneoLogo ? <img src={torneoLogo} alt="" /> : null}
                {torneoNombre}
              </span>
            )}
            {partido.contexto} · J{partido.jornada}
          </span>
          <span className={enVivo ? 'publico-lista-partido-chip publico-lista-partido-chip--vivo' : 'publico-lista-partido-chip'}>
            {transmisionHabilitada && enVivo && partido.url_transmision && <span className="publico-lista-partido-tv">📺 </span>}
            {enVivo && (
              <>
                ● {ETIQUETA_TIEMPO[partido.tiempo_actual] || 'En vivo'}{' '}
                {['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && <RelojConAdicion partido={partido} totalSeg={totalSeg} />}
              </>
            )}
            {partido.estado === 'jugado' && 'Finalizado'}
            {(partido.estado === 'programado' || partido.estado === 'reprogramado') && 'Programado'}
          </span>
        </span>
        <span className="publico-lista-partido-equipos">
          <span className="publico-lista-partido-equipo">
            <EscudoEquipo url={partido.equipo_local_escudo} nombre={partido.equipo_local_nombre} />
            {partido.equipo_local_nombre}
          </span>
          <span className="publico-lista-partido-marcador">
            {partido.estado === 'programado' || partido.estado === 'reprogramado' ? (
              <span className="publico-lista-partido-fechahoy">
                {partido.fecha_hora && new Date(partido.fecha_hora).toDateString() === new Date().toDateString() && (
                  <span className="publico-lista-partido-hoy">HOY</span>
                )}
                {partido.fecha_hora ? new Date(partido.fecha_hora).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin hora'}
              </span>
            ) : `${partido.goles_local ?? 0} - ${partido.goles_visitante ?? 0}`}
          </span>
          <span className="publico-lista-partido-equipo publico-lista-partido-equipo--visitante">
            {partido.equipo_visitante_nombre}
            <EscudoEquipo url={partido.equipo_visitante_escudo} nombre={partido.equipo_visitante_nombre} />
          </span>
        </span>
      </button>
      {abierto && detalle && (
        <div className="publico-lista-partido-detalle">
          {transmisionHabilitada && detalle.partido.url_transmision && (
            detalle.partido.estado === 'jugado' ? (
              <p className="publico-lista-partido-transmision-finalizada">📴 La transmisión de este partido ha finalizado.</p>
            ) : urlEmbebible(detalle.partido.url_transmision) ? (
              <div className="publico-lista-partido-transmision">
                <iframe
                  src={urlEmbebible(detalle.partido.url_transmision)}
                  title="Transmisión en vivo"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <a href={detalle.partido.url_transmision} target="_blank" rel="noreferrer" className="publico-lista-partido-transmision-enlace">
                📺 Ver transmisión en vivo
              </a>
            )
          )}
          {enVivo && (
            <button type="button" className={'publico-lista-partido-fijar' + (fijado ? ' publico-lista-partido-fijar--activo' : '')} onClick={() => onFijar(partido.id)}>
              📌 {fijado ? 'Fijado — no se contrae al abrir otro' : 'Fijar para que no se contraiga'}
            </button>
          )}
          {detalle.correccion && (
            <p className="publico-lista-partido-correccion">
              ⚠ El marcador se corrigió: antes {detalle.correccion.goles_local_anterior}-{detalle.correccion.goles_visitante_anterior},
              ahora {detalle.correccion.goles_local_nuevo}-{detalle.correccion.goles_visitante_nuevo}. Motivo: {detalle.correccion.motivo}
            </p>
          )}
          <LineaTiempoPartido partido={detalle.partido} goles={detalle.goles} tarjetas={detalle.tarjetas} cambios={detalle.cambios} hitos={detalle.hitos} />
        </div>
      )}
    </div>
  );
}
