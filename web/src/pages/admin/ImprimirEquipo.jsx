import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { calcularEdad } from '../../lib/edad';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

export default function ImprimirEquipo() {
  const { equipoId } = useParams();
  const { datos, cargando } = useCargaMinima(async () => {
    const equipo = await api('/equipos/' + equipoId);
    const [torneo, jugadores] = await Promise.all([
      api('/torneos/' + equipo.torneo_id),
      api('/jugadores?equipo_id=' + equipoId)
    ]);
    return { equipo, torneo, jugadores };
  }, [equipoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando planilla del equipo..." />;

  const { equipo, torneo, jugadores } = datos;
  const fechaReferencia = torneo.fecha_inicio || new Date().toISOString();

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {equipo.escudo_url && <img src={equipo.escudo_url} alt="" />}
        <div>
          <h1>{equipo.nombre}</h1>
          <p>{torneo.nombre} — Delegado: {equipo.delegado || '—'} {equipo.delegado_telefono && `· ${equipo.delegado_telefono}`}</p>
        </div>
      </header>

      <table className="imprimir-tabla">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>N° Documento</th>
            <th>Fecha de nacimiento</th>
            <th>Edad</th>
          </tr>
        </thead>
        <tbody>
          {jugadores.map((j) => (
            <tr key={j.id}>
              <td>{j.numero_camiseta ?? '—'}</td>
              <td>{j.nombre}</td>
              <td>{j.cedula || '—'}</td>
              <td>{j.fecha_nacimiento ? new Date(j.fecha_nacimiento).toLocaleDateString('es-CO') : '—'}</td>
              <td>{calcularEdad(j.fecha_nacimiento, fechaReferencia) ?? '—'}</td>
            </tr>
          ))}
          {jugadores.length === 0 && (
            <tr><td colSpan={5}>Este equipo todavía no tiene jugadores.</td></tr>
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
