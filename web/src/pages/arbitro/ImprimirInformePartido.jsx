import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';
import LineaTiempoPartido from '../../components/LineaTiempoPartido';

function EscudoEquipo({ url, nombre }) {
  return url
    ? <img src={url} alt={nombre} className="imprimir-informe-escudo" />
    : <span className="imprimir-informe-escudo imprimir-informe-escudo--vacio" />;
}

export default function ImprimirInformePartido() {
  const { partidoId } = useParams();
  const { datos, cargando } = useCargaMinima(() => api(`/planilla/${partidoId}`), [partidoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando el informe..." />;

  const { partido, goles, tarjetas, cambios, hitos } = datos;

  return (
    <div className="imprimir-page imprimir-page--informe">
      <div className="imprimir-barra no-imprimir">
        <Link to={`/arbitro/planilla/${partido.id}`}>← Volver a la planilla</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-jornada-header">
        <div>
          <span className="imprimir-jornada-eyebrow">{partido.torneo_nombre}</span>
          <h1>Informe del partido</h1>
          <p>Jornada {partido.jornada} — {nombreModalidad(partido.modalidad)}</p>
        </div>
      </header>

      <div className="imprimir-informe-cabecera">
        <div className="imprimir-informe-equipo">
          <EscudoEquipo url={partido.equipo_local_escudo} nombre={partido.equipo_local_nombre} />
          <span>{partido.equipo_local_nombre}</span>
        </div>
        <div className="imprimir-informe-marcador">
          <strong>{partido.goles_local} - {partido.goles_visitante}</strong>
          <span className="imprimir-informe-estado">Finalizado</span>
        </div>
        <div className="imprimir-informe-equipo imprimir-informe-equipo--visitante">
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
      {partido.jugado_desde && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>
          {new Date(partido.jugado_desde).toLocaleDateString('es-CO', { dateStyle: 'medium' })} — de {new Date(partido.jugado_desde).toLocaleTimeString('es-CO', { timeStyle: 'short' })}
          {partido.jugado_hasta && ` a ${new Date(partido.jugado_hasta).toLocaleTimeString('es-CO', { timeStyle: 'short' })}`}
        </p>
      )}

      <LineaTiempoPartido partido={partido} goles={goles} tarjetas={tarjetas} cambios={cambios} hitos={hitos} />

      <div className="imprimir-informe-firma">
        <h3>Certifica</h3>
        <div className="imprimir-informe-firmas">
          <div className="imprimir-informe-firma-bloque">
            <span className="imprimir-informe-firma-etiqueta">Delegado — {partido.equipo_local_nombre}</span>
            {partido.firma_delegado_local ? (
              <>
                <img src={partido.firma_delegado_local} alt="Firma" className="planilla-firma-imagen" />
                <p>{partido.firmante_delegado_local || '—'} — {partido.firmado_delegado_local_en ? new Date(partido.firmado_delegado_local_en).toLocaleString('es-CO') : ''}</p>
              </>
            ) : (
              <p className="admin-empty">No firmó.</p>
            )}
          </div>
          <div className="imprimir-informe-firma-bloque">
            <span className="imprimir-informe-firma-etiqueta">Delegado — {partido.equipo_visitante_nombre}</span>
            {partido.firma_delegado_visitante ? (
              <>
                <img src={partido.firma_delegado_visitante} alt="Firma" className="planilla-firma-imagen" />
                <p>{partido.firmante_delegado_visitante || '—'} — {partido.firmado_delegado_visitante_en ? new Date(partido.firmado_delegado_visitante_en).toLocaleString('es-CO') : ''}</p>
              </>
            ) : (
              <p className="admin-empty">No firmó.</p>
            )}
          </div>
          <div className="imprimir-informe-firma-bloque">
            <span className="imprimir-informe-firma-etiqueta">Árbitro/anotador</span>
            {partido.firma_arbitro ? (
              <>
                <img src={partido.firma_arbitro} alt="Firma" className="planilla-firma-imagen" />
                <p>{partido.firmante_nombre || partido.firmado_por_nombre || '—'} — {partido.firmado_en ? new Date(partido.firmado_en).toLocaleString('es-CO') : ''}</p>
              </>
            ) : (
              <p className="admin-empty">Esta planilla todavía no ha sido firmada.</p>
            )}
          </div>
        </div>
        {partido.observaciones_arbitro && (
          <p className="imprimir-informe-observaciones"><strong>Observaciones:</strong> {partido.observaciones_arbitro}</p>
        )}
      </div>

      <p className="imprimir-pie">Generado el {new Date().toLocaleString('es-CO')} — CampeonApp</p>
    </div>
  );
}
