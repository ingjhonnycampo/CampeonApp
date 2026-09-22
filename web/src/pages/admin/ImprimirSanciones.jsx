import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { nombreModalidad } from '../../lib/modalidad';
import { restriccionSancion } from '../../lib/sanciones';
import { api } from '../../lib/api';
import { useCargaMinima } from '../../lib/useCargaMinima';
import CargaJugador from '../../components/CargaJugador';

const ETIQUETA_SANCION = {
  amarilla: 'Tarjeta amarilla',
  azul: 'Tarjeta azul',
  doble_amarilla: 'Doble amarilla (expulsión)',
  roja_directa: 'Tarjeta roja directa'
};

// Agrupa en los 3 bloques que pidió el organizador: la doble amarilla termina en
// una roja de expulsión, así que va junto con la roja directa, no aparte.
const BLOQUE_DE = { amarilla: 'amarilla', azul: 'azul', doble_amarilla: 'roja', roja_directa: 'roja' };
const BLOQUES = [
  { clave: 'amarilla', titulo: 'Amarillas' },
  { clave: 'azul', titulo: 'Azul' },
  { clave: 'roja', titulo: 'Roja' }
];

function formatoMulta(valor) {
  return Number(valor) > 0 ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor) : null;
}

export default function ImprimirSanciones() {
  const { torneoId } = useParams();
  const [fecha, setFecha] = useState('todas');

  const { datos, cargando } = useCargaMinima(async () => {
    const [torneo, sanciones] = await Promise.all([
      api('/torneos/' + torneoId),
      api('/sanciones?torneo_id=' + torneoId)
    ]);

    let partidos = [];
    if (torneo.formato === 'liga') {
      partidos = await api('/partidos?torneo_id=' + torneoId);
    } else {
      const fases = await api('/fases?torneo_id=' + torneoId);
      const faseGrupos = fases.find((f) => f.tipo === 'grupos');
      if (faseGrupos) partidos = await api(`/fases/${faseGrupos.id}/partidos`);
    }
    const jornadas = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);

    return { torneo, sanciones, jornadas };
  }, [torneoId]);

  if (cargando || !datos) return <CargaJugador texto="Cargando las sanciones..." />;

  const { torneo, sanciones, jornadas } = datos;

  // "todas" = todo lo que está activo ahora mismo. Una fecha puntual = lo que ya
  // se había producido para esa fecha (jornadaOrigen <= fecha) y AÚN sigue activo
  // (no se ha pagado/cumplido) — sale aparezca o no su equipo esa fecha en el
  // fixture, porque la sanción inhabilita al jugador, no a una fecha concreta.
  const visibles = fecha === 'todas'
    ? sanciones
    : sanciones.filter((s) => s.jornadaOrigen !== null && s.jornadaOrigen <= Number(fecha));

  const porBloque = { amarilla: [], azul: [], roja: [] };
  for (const s of visibles) porBloque[BLOQUE_DE[s.tipoSancion]].push(s);

  return (
    <div className="imprimir-page">
      <div className="imprimir-barra no-imprimir">
        <Link to="/admin/campeonatos">← Volver al panel</Link>
        <label className="imprimir-selector-fecha">
          Ver sanciones vigentes para
          <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
            <option value="todas">Todas (estado actual)</option>
            {jornadas.map((j) => <option key={j} value={j}>Fecha {j}</option>)}
          </select>
        </label>
        <button onClick={() => window.print()}>Imprimir</button>
      </div>

      <header className="imprimir-header">
        {torneo.logo_url && <img src={torneo.logo_url} alt="" />}
        <div>
          <h1>{torneo.nombre}</h1>
          <p>
            Sanciones {fecha === 'todas' ? 'vigentes' : `de cara a la Fecha ${fecha}`} — {nombreModalidad(torneo.modalidad)}
          </p>
        </div>
      </header>

      {visibles.length === 0 && (
        <p className="admin-empty">
          {fecha === 'todas' ? 'No hay jugadores sancionados en este momento.' : `Nadie sigue sancionado para la Fecha ${fecha}.`}
        </p>
      )}

      {BLOQUES.map(({ clave, titulo }) => porBloque[clave].length > 0 && (
        <div key={clave} className="imprimir-sancion-bloque">
          <h2>{titulo}</h2>
          <table className="imprimir-tabla">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Equipo</th>
                <th>Sanción</th>
                <th>Producida en</th>
                <th>Multa</th>
              </tr>
            </thead>
            <tbody>
              {porBloque[clave].map((s) => (
                <tr key={s.tarjetaId}>
                  <td>{s.jugadorNombre}</td>
                  <td>{s.equipoNombre}</td>
                  <td>{ETIQUETA_SANCION[s.tipoSancion]} — {restriccionSancion(s)}</td>
                  <td>Fecha {s.jornadaOrigen ?? '—'}</td>
                  <td>{formatoMulta(s.multa) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="imprimir-pie">
        {(torneo.organizador || torneo.telefono_organizador) && (
          <>Organiza: {torneo.organizador || '—'} {torneo.telefono_organizador && `· Tel: ${torneo.telefono_organizador}`} — </>
        )}
        Generado el {new Date().toLocaleString('es-CO')} — CampeonApp
      </p>
    </div>
  );
}
