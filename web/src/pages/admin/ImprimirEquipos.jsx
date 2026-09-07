import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

export default function ImprimirEquipos() {
  const { torneoId } = useParams();
  const { datos, cargando } = useCargaMinima(
    () => Promise.all([api('/torneos/' + torneoId), api('/equipos?torneo_id=' + torneoId)]),
    [torneoId]
  );

  if (cargando || !datos) return <CargaJugador texto="Cargando listado de equipos..." />;

  const [torneo, equipos] = datos;

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>{torneo.nombre}</h1>
          <p>Listado general de equipos — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      <table className="imprimir-tabla">
        <thead>
          <tr>
            <th>#</th>
            <th>Equipo</th>
            <th>Delegado</th>
            <th>Teléfono</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {equipos.map((eq, i) => (
            <tr key={eq.id}>
              <td>{i + 1}</td>
              <td>{eq.nombre}</td>
              <td>{eq.delegado || '—'}</td>
              <td>{eq.delegado_telefono || '—'}</td>
              <td>{eq.estado}</td>
            </tr>
          ))}
          {equipos.length === 0 && (
            <tr><td colSpan={5}>Todavía no hay equipos inscritos.</td></tr>
          )}
        </tbody>
      </table>

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
