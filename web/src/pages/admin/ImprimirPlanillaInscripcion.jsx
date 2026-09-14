import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

export default function ImprimirPlanillaInscripcion() {
  const { torneoId } = useParams();
  const { datos, cargando } = useCargaMinima(async () => {
    const [torneo, reglas] = await Promise.all([
      api('/torneos/' + torneoId),
      api('/torneos/' + torneoId + '/reglas')
    ]);
    return { torneo, reglasPlanilla: reglas.filter((r) => r.ambito === 'planilla') };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando la planilla de inscripción..." />;

  const { torneo, reglasPlanilla } = datos;
  const filas = torneo.max_jugadores || 20;

  return (
    <div className="imprimir-page imprimir-page--planilla-manual">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/campeonatos">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>Planilla de inscripción</h1>
          <p>{torneo.nombre} — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      <p className="planilla-manual-nota">
        Para equipos que no puedan hacer la inscripción virtual: diligencia esta hoja a mano, con letra
        clara, y entrégasela al organizador para que registre el equipo en la aplicación.
        {torneo.inscripciones_hasta && (
          <> Las inscripciones cierran el {new Date(torneo.inscripciones_hasta).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.</>
        )}
      </p>

      {reglasPlanilla.length > 0 && (
        <p className="planilla-manual-nota">
          <strong>Condiciones de edad para poder inscribirse:</strong>{' '}
          {reglasPlanilla.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ' · '}
              Mínimo {r.cantidad_minima} jugador{r.cantidad_minima === 1 ? '' : 'es'} de {r.edad_minima}+ años
              {r.descripcion ? ` (${r.descripcion})` : ''}
            </span>
          ))}
        </p>
      )}

      <div className="planilla-manual-equipo">
        <h2>Datos del equipo</h2>
        <div className="planilla-manual-datos-equipo">
          <div className="planilla-manual-campo planilla-manual-campo--ancho">
            <span>Nombre del equipo</span>
            <div className="planilla-manual-linea" />
          </div>
          <div className="planilla-manual-campo">
            <span>Delegado</span>
            <div className="planilla-manual-linea" />
          </div>
          <div className="planilla-manual-campo">
            <span>Teléfono del delegado</span>
            <div className="planilla-manual-linea" />
          </div>
        </div>
        <p className="admin-empty">
          Entre {torneo.min_jugadores} y {torneo.max_jugadores} jugadores.
        </p>
      </div>

      <div className="imprimir-tabla-scroll">
        <table className="imprimir-tabla planilla-manual-tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre completo</th>
              <th>N° Documento</th>
              <th>Fecha de nacimiento</th>
              <th>N° Camiseta</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: filas }).map((_, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-blanco" />
                <td className="planilla-manual-blanco" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="planilla-manual-firmas">
        <div className="planilla-manual-firma-bloque">
          <div className="planilla-manual-firma-linea" />
          <span>Firma del delegado</span>
        </div>
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
