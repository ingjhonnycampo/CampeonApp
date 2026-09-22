import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

function TablaGoleadores({ goleadores }) {
  if (goleadores.length === 0) return <p className="admin-empty">Todavía no hay goles registrados.</p>;
  return (
    <table className="imprimir-tabla">
      <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>
      <tbody>
        {goleadores.map((g, i) => (
          <tr key={g.jugador_id}><td>{i + 1}</td><td>{g.jugador_nombre}</td><td>{g.equipo_nombre}</td><td>{g.goles}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaVallaMenosVencida({ equipos }) {
  if (equipos.length === 0) return <p className="admin-empty">Todavía no hay partidos jugados.</p>;
  return (
    <table className="imprimir-tabla">
      <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>GC</th></tr></thead>
      <tbody>
        {equipos.map((e, i) => (
          <tr key={e.equipo_id}><td>{i + 1}</td><td>{e.nombre}</td><td>{e.pj}</td><td>{e.gc}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaHistoricoSanciones({ sanciones }) {
  if (sanciones.length === 0) return <p className="admin-empty">Todavía no hay tarjetas registradas.</p>;
  return (
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
  );
}

export default function ImprimirEstadisticas() {
  const { torneoId } = useParams();
  const { datos, cargando } = useCargaMinima(async () => {
    const [torneo, estadisticas] = await Promise.all([
      api('/torneos/' + torneoId),
      api('/torneos/' + torneoId + '/estadisticas')
    ]);

    let tablaPosiciones = [];
    if (torneo.formato === 'liga') {
      tablaPosiciones = await api('/partidos/posiciones?torneo_id=' + torneoId);
    } else {
      const fases = await api('/fases?torneo_id=' + torneoId);
      const faseGrupos = fases.find((f) => f.tipo === 'grupos');
      if (faseGrupos) {
        const tablas = await api(`/fases/${faseGrupos.id}/posiciones`);
        tablaPosiciones = tablas.flatMap((t) => t.tabla);
      }
    }
    const vallaMenosVencida = [...tablaPosiciones].filter((e) => e.pj > 0).sort((a, b) => a.gc - b.gc || a.dif - b.dif);

    return { torneo, estadisticas, vallaMenosVencida };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando las estadísticas..." />;

  const { torneo, estadisticas, vallaMenosVencida } = datos;

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/fixture">← Volver al panel</Link>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>{torneo.nombre}</h1>
          <p>Estadísticas del campeonato — {nombreModalidad(torneo.modalidad)}</p>
        </div>
      </header>

      <div className="imprimir-sancion-bloque">
        <h2>Goleadores</h2>
        <TablaGoleadores goleadores={estadisticas.goleadores} />
      </div>

      <div className="imprimir-sancion-bloque">
        <h2>Valla menos vencida</h2>
        <TablaVallaMenosVencida equipos={vallaMenosVencida} />
      </div>

      <div className="imprimir-sancion-bloque">
        <h2>Histórico de sanciones (todo el campeonato)</h2>
        <TablaHistoricoSanciones sanciones={estadisticas.sanciones} />
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
