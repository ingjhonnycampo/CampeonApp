import { useParams, Link } from 'react-router-dom';
import { nombreModalidad, usaAlineacionFormal, permiteTarjetaAzul } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

function TablaEquipo({ titulo, jugadores, conAlineacion, conAzul }) {
  return (
    <div className="planilla-manual-equipo">
      <h2>{titulo}</h2>
      <div className="imprimir-tabla-scroll">
        <table className="imprimir-tabla planilla-manual-tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              {conAlineacion && <th>Titular</th>}
              {conAlineacion && <th>Suplente</th>}
              <th>Goles (marca una raya por cada uno)</th>
              <th>🟨</th>
              <th>🟥</th>
              {conAzul && <th>🟦</th>}
            </tr>
          </thead>
          <tbody>
            {jugadores.map((j) => (
              <tr key={j.id}>
                <td>{j.numero_camiseta ?? '—'}</td>
                <td>{j.nombre}</td>
                {conAlineacion && <td className="planilla-manual-casilla" />}
                {conAlineacion && <td className="planilla-manual-casilla" />}
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-casilla" />
                <td className="planilla-manual-casilla" />
                {conAzul && <td className="planilla-manual-casilla" />}
              </tr>
            ))}
            {jugadores.length === 0 && (
              <tr><td colSpan={conAlineacion ? (conAzul ? 8 : 7) : (conAzul ? 6 : 5)}>Este equipo todavía no tiene jugadores validados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImprimirPlanillaManual() {
  const { partidoId } = useParams();
  const { datos, cargando } = useCargaMinima(() => api(`/planilla/${partidoId}`), [partidoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando la planilla..." />;

  const { partido, convocadosLocal, convocadosVisitante } = datos;
  const conAlineacion = usaAlineacionFormal(partido.modalidad);
  const conAzul = permiteTarjetaAzul(partido.modalidad);

  return (
    <div className="imprimir-page imprimir-page--planilla-manual">
      <div className="imprimir-barra no-imprimir">
        <Link to={`/arbitro/planilla/${partido.id}`}>← Volver a la planilla</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        <div>
          <h1>Planilla manual de respaldo</h1>
          <p>{partido.torneo_nombre} — Jornada {partido.jornada} — {nombreModalidad(partido.modalidad)}</p>
        </div>
      </header>

      <p className="planilla-manual-nota">
        Usa esta hoja en papel si no hay conexión a internet durante el partido. Anota cada gol, tarjeta y
        cambio con el número y el nombre del jugador — el minuto exacto no es obligatorio. Apenas se
        restablezca la conexión, entra a la planilla del partido en la aplicación y usa
        "¿Este partido ya se jugó sin conexión?" para cargar esta misma información.
      </p>

      <div className="planilla-manual-datos">
        <span><strong>{partido.equipo_local_nombre}</strong> vs <strong>{partido.equipo_visitante_nombre}</strong></span>
        <span>{partido.fecha_hora ? new Date(partido.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha programada'}</span>
      </div>

      <div className="planilla-manual-resultado">
        <span>Resultado final</span>
        <div className="planilla-manual-marcador">
          <span className="planilla-manual-equipo-nombre">{partido.equipo_local_nombre}</span>
          <span className="planilla-manual-casilla-grande" />
          <span className="planilla-manual-guion">-</span>
          <span className="planilla-manual-casilla-grande" />
          <span className="planilla-manual-equipo-nombre">{partido.equipo_visitante_nombre}</span>
        </div>
      </div>

      <TablaEquipo titulo={partido.equipo_local_nombre} jugadores={convocadosLocal} conAlineacion={conAlineacion} conAzul={conAzul} />
      <TablaEquipo titulo={partido.equipo_visitante_nombre} jugadores={convocadosVisitante} conAlineacion={conAlineacion} conAzul={conAzul} />

      <div className="planilla-manual-cambios">
        <h2>Cambios</h2>
        <table className="imprimir-tabla planilla-manual-tabla">
          <thead>
            <tr>
              <th>Equipo</th>
              <th>Sale (# y nombre)</th>
              <th>Entra (# y nombre)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-blanco" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="planilla-manual-observaciones">
        <h2>Observaciones</h2>
        <div className="planilla-manual-linea" />
        <div className="planilla-manual-linea" />
        <div className="planilla-manual-linea" />
      </div>

      <div className="planilla-manual-firmas">
        <div className="planilla-manual-firma-bloque">
          <div className="planilla-manual-firma-linea" />
          <span>Delegado — {partido.equipo_local_nombre}</span>
        </div>
        <div className="planilla-manual-firma-bloque">
          <div className="planilla-manual-firma-linea" />
          <span>Delegado — {partido.equipo_visitante_nombre}</span>
        </div>
        <div className="planilla-manual-firma-bloque">
          <div className="planilla-manual-firma-linea" />
          <span>Árbitro/anotador</span>
        </div>
      </div>

      <p className="imprimir-pie">Generado el {new Date().toLocaleString('es-CO')} — CampeonApp</p>
    </div>
  );
}
