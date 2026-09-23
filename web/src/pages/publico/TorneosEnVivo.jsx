import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { nombreModalidad } from '../../lib/modalidad';
import CargaJugador from '../../components/CargaJugador';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import { registrarVisita } from '../../lib/visitas';

// Solo un listado de campeonatos — al tocar uno se entra a su propia página
// (PartidosPublico), que ya muestra los partidos del día, los ya jugados y las
// estadísticas de ESE campeonato. Antes acá también se mezclaban los partidos de
// TODOS los campeonatos en una sola lista, lo cual resultaba confuso.
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
  const [cargando, setCargando] = useState(true);
  const [verFinalizados, setVerFinalizados] = useState(false);

  useEffect(() => { registrarVisita('en_vivo'); }, []);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const lista = await api('/publico/torneos');
      if (activo) { setTorneos(lista); setCargando(false); }
    }
    cargar();
    const id = setInterval(cargar, 15000);
    return () => { activo = false; clearInterval(id); };
  }, []);

  if (cargando) return <CargaJugador texto="Cargando los campeonatos..." />;

  const torneosActivos = torneos.filter((t) => t.estado !== 'finalizado');
  const torneosFinalizados = torneos.filter((t) => t.estado === 'finalizado');

  return (
    <div className="publico-partido-page">
      <Link to="/" className="publico-en-vivo-volver">← Inicio</Link>
      <div className="publico-en-vivo-cabecera">
        <h1>Campeonatos en vivo</h1>
        <span className="publico-en-vivo-modalidad">Elige un campeonato para ver sus partidos y estadísticas</span>
      </div>

      {torneos.length === 0 && <p className="admin-empty">Todavía no hay ningún campeonato con fixture generado.</p>}

      <div className="publico-torneo-bandas">
        {torneosActivos.map((t) => <BandaTorneo key={t.id} torneo={t} />)}

        {verFinalizados && torneosFinalizados.map((t) => <BandaTorneo key={t.id} torneo={t} />)}

        {torneosFinalizados.length > 0 && (
          <button type="button" className="publico-torneo-banda-vermas" onClick={() => setVerFinalizados((v) => !v)}>
            {verFinalizados ? '▲ Ver menos' : `▼ Ver campeonatos finalizados (${torneosFinalizados.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
