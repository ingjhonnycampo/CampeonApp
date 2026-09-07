import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiPublico } from '../../lib/api';
import { nombreModalidad } from '../../lib/modalidad';
import CargaJugador from '../../components/CargaJugador';
import LineaTiempoPartido from '../../components/LineaTiempoPartido';
import RelojConAdicion from '../../components/RelojConAdicion';

const ETIQUETA_TIEMPO = {
  primer_tiempo: 'Primer tiempo',
  descanso: 'Descanso',
  segundo_tiempo: 'Segundo tiempo',
  finalizado: 'Por finalizar'
};

function useCronometroPublico(partido) {
  const [ahora, setAhora] = useState(Date.now());
  const corriendo = !!partido?.cronometro_inicio;

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [corriendo, partido?.cronometro_inicio]);

  if (!partido) return 0;
  const segundosCorridos = corriendo ? Math.floor((ahora - new Date(partido.cronometro_inicio).getTime()) / 1000) : 0;
  return (partido.cronometro_acumulado_seg || 0) + segundosCorridos;
}

function EscudoEquipo({ url, nombre }) {
  return url
    ? <img src={url} alt={nombre} className="publico-partido-escudo" />
    : <span className="publico-partido-escudo publico-partido-escudo--vacio" />;
}

export default function PartidoPublico() {
  const { partidoId } = useParams();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        const data = await apiPublico(`/partidos/${partidoId}`);
        if (activo) setDatos(data);
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargar();
    const id = setInterval(cargar, 8000);
    return () => { activo = false; clearInterval(id); };
  }, [partidoId]);

  const totalSeg = useCronometroPublico(datos?.partido);

  if (cargando || !datos) return <CargaJugador texto="Cargando el partido..." />;

  const { partido, goles, tarjetas, cambios, hitos, correccion } = datos;
  const enVivo = partido.estado === 'en_curso';
  const finalizado = partido.estado === 'jugado';

  return (
    <div className="publico-partido-page">
      <div className="publico-partido-breadcrumb">
        <span>{nombreModalidad(partido.modalidad)}</span>
        <span>·</span>
        <span>{partido.torneo_nombre}</span>
        <span>·</span>
        <span>Jornada {partido.jornada}</span>
      </div>

      <div className="publico-partido-cabecera">
        <div className="publico-partido-equipo">
          <EscudoEquipo url={partido.equipo_local_escudo} nombre={partido.equipo_local_nombre} />
          <span>{partido.equipo_local_nombre}</span>
        </div>
        <div className="publico-partido-marcador">
          <strong>{partido.goles_local ?? 0} - {partido.goles_visitante ?? 0}</strong>
          {finalizado && <span className="publico-partido-estado">Finalizado</span>}
          {enVivo && (
            <span className="publico-partido-estado publico-partido-estado--vivo">
              ● {ETIQUETA_TIEMPO[partido.tiempo_actual] || 'En vivo'} {['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && (
                <RelojConAdicion partido={partido} totalSeg={totalSeg} />
              )}
            </span>
          )}
          {!enVivo && !finalizado && <span className="publico-partido-estado">Programado</span>}
        </div>
        <div className="publico-partido-equipo publico-partido-equipo--visitante">
          <span>{partido.equipo_visitante_nombre}</span>
          <EscudoEquipo url={partido.equipo_visitante_escudo} nombre={partido.equipo_visitante_nombre} />
        </div>
      </div>

      {partido.penales_local != null && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>Definido por penales: {partido.penales_local}-{partido.penales_visitante}</p>
      )}
      {partido.es_walkover && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>
          Definido por walkover — no se presentó {partido.walkover_ausente_id === partido.equipo_local_id ? partido.equipo_local_nombre : partido.equipo_visitante_nombre}.
        </p>
      )}

      {correccion && (
        <p className="publico-lista-partido-correccion">
          ⚠ El marcador se corrigió: antes {correccion.goles_local_anterior}-{correccion.goles_visitante_anterior},
          ahora {correccion.goles_local_nuevo}-{correccion.goles_visitante_nuevo}. Motivo: {correccion.motivo}
        </p>
      )}

      <LineaTiempoPartido partido={partido} goles={goles} tarjetas={tarjetas} cambios={cambios} hitos={hitos} />
    </div>
  );
}
