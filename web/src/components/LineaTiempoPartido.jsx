import IconoCambio from './IconoCambio';

// "20'" en tiempo regular, o "20+3'" si ocurrió en tiempo de adición (ver
// minuto_adicion en el servidor: server/routes/planilla.js).
function etiquetaMinuto(minuto, minutoAdicion) {
  if (minuto == null) return '';
  return minutoAdicion != null ? `${minuto}+${minutoAdicion}'` : `${minuto}'`;
}

const ICONO_TARJETA = { amarilla: '🟨', roja: '🟥', azul: '🟦' };
const ETIQUETA_SECCION = { primer_tiempo: '1er Tiempo', segundo_tiempo: '2do Tiempo', sin_tiempo: 'Antes del partido / Descanso' };
const ETIQUETA_HITO = {
  inicio_partido: 'Inicio del partido',
  fin_primer_tiempo: 'Fin del primer tiempo',
  inicio_segundo_tiempo: 'Inicio del segundo tiempo',
  fin_partido: 'Fin del partido'
};

// El árbitro/anotador identifica a un jugador por el número de la camiseta
// mucho más rápido que por el nombre — se antepone a cada nombre donde haya dato.
function numero(n) {
  return n != null ? `#${n} ` : '';
}

function EventoTexto({ ev }) {
  if (ev._tipo === 'gol') return <>⚽ {numero(ev.jugador_numero)}{ev.jugador_nombre || 'Jugador'}{ev.en_propia_puerta ? ' (en propia puerta)' : ''}</>;
  if (ev._tipo === 'cambio') {
    return (
      <>
        <IconoCambio size={14} className="linea-tiempo-icono-cambio" /> {numero(ev.jugador_sale_numero)}{ev.jugador_sale_nombre}{' '}
        <span className="linea-tiempo-flecha">→</span> {numero(ev.jugador_entra_numero)}{ev.jugador_entra_nombre}
      </>
    );
  }
  return <>{ICONO_TARJETA[ev.tipo]} {numero(ev.jugador_numero)}{ev.jugador_nombre}</>;
}

function FilaHito({ hito }) {
  if (!hito) return null;
  return (
    <div className="linea-tiempo-hito">
      🔔 {ETIQUETA_HITO[hito.tipo]}{hito.minuto != null ? ` · ${etiquetaMinuto(hito.minuto, hito.minuto_adicion)}` : ''}
    </div>
  );
}

// Linea de tiempo del partido agrupada por tiempo (1er/2do): cada evento ocupa
// su propia fila, alineado a la izquierda si es del local o a la derecha si es
// del visitante, en ORDEN CRONOLÓGICO real dentro de cada tiempo (no por
// posición en la lista de cada equipo — dos eventos de minutos distintos nunca
// comparten fila aunque sean el primero de cada equipo). Los hitos del
// cronómetro (inicio/fin de cada tiempo) van centrados al principio y al final
// de cada sección. La usan el informe imprimible, la vista pública en vivo y la
// planilla del árbitro (esta última con onQuitar, para deshacer un evento).
export default function LineaTiempoPartido({ partido, goles, tarjetas, cambios, hitos = [], onQuitar }) {
  const todos = [
    ...goles.map((g) => ({ ...g, _tipo: 'gol' })),
    ...tarjetas.map((t) => ({ ...t, _tipo: 'tarjeta' })),
    ...cambios.map((c) => ({ ...c, _tipo: 'cambio' }))
  ];

  const porTiempo = { primer_tiempo: [], segundo_tiempo: [], sin_tiempo: [] };
  todos.forEach((ev) => { (porTiempo[ev.tiempo] || porTiempo.sin_tiempo).push(ev); });
  // Goles, tarjetas y cambios vienen de tablas distintas, cada una con su propio
  // conteo de "id" — dos eventos del mismo minuto pueden tener ids que no
  // guardan relación con cuál pasó primero de verdad. Por eso el desempate usa
  // "creado_en" (cuándo se registró en el servidor), que sí es comparable entre
  // los tres tipos, y solo cae a "id" si por algún motivo no viniera ese dato.
  Object.values(porTiempo).forEach((lista) => lista.sort((a, b) =>
    (a.minuto ?? 0) - (b.minuto ?? 0) || (a.minuto_adicion ?? 0) - (b.minuto_adicion ?? 0) ||
    (a.creado_en && b.creado_en ? new Date(a.creado_en) - new Date(b.creado_en) : a.id - b.id)
  ));

  const hitosPorTiempo = { primer_tiempo: { inicio: null, fin: null }, segundo_tiempo: { inicio: null, fin: null } };
  hitos.forEach((h) => {
    if (h.tipo === 'inicio_partido') hitosPorTiempo.primer_tiempo.inicio = h;
    else if (h.tipo === 'fin_primer_tiempo') hitosPorTiempo.primer_tiempo.fin = h;
    else if (h.tipo === 'inicio_segundo_tiempo') hitosPorTiempo.segundo_tiempo.inicio = h;
    else if (h.tipo === 'fin_partido') hitosPorTiempo.segundo_tiempo.fin = h;
  });

  const secciones = ['sin_tiempo', 'primer_tiempo', 'segundo_tiempo']
    .map((clave) => [clave, porTiempo[clave]])
    .filter(([clave, eventos]) => eventos.length > 0 || hitosPorTiempo[clave]?.inicio || hitosPorTiempo[clave]?.fin);

  if (secciones.length === 0) {
    return <p className="admin-empty" style={{ textAlign: 'center' }}>No hubo goles, tarjetas ni cambios en este partido.</p>;
  }

  function quitar(ev) {
    if (ev._tipo === 'gol') onQuitar('gol', ev.id);
    else if (ev._tipo === 'tarjeta') onQuitar('tarjeta', ev.id);
    else onQuitar('cambio', ev.id);
  }

  return (
    <div className="linea-tiempo">
      {secciones.map(([clave, eventos]) => {
        const hh = hitosPorTiempo[clave];
        return (
          <div key={clave} className="linea-tiempo-seccion">
            <h4 className="linea-tiempo-titulo">{ETIQUETA_SECCION[clave]}</h4>
            <FilaHito hito={hh?.inicio} />
            {eventos.map((ev) => {
              const esLocal = ev.equipo_id === partido.equipo_local_id;
              return (
                <div key={`${ev._tipo}-${ev.id}`} className="linea-tiempo-fila">
                  <div className="linea-tiempo-celda linea-tiempo-celda--local">
                    {esLocal && (
                      <>
                        <span className="linea-tiempo-minuto">{etiquetaMinuto(ev.minuto, ev.minuto_adicion)}</span>
                        <span><EventoTexto ev={ev} /></span>
                        {onQuitar && <button type="button" className="publico-quitar" onClick={() => quitar(ev)}>Quitar</button>}
                      </>
                    )}
                  </div>
                  <div className="linea-tiempo-celda linea-tiempo-celda--visitante">
                    {!esLocal && (
                      <>
                        {onQuitar && <button type="button" className="publico-quitar" onClick={() => quitar(ev)}>Quitar</button>}
                        <span><EventoTexto ev={ev} /></span>
                        <span className="linea-tiempo-minuto">{etiquetaMinuto(ev.minuto, ev.minuto_adicion)}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <FilaHito hito={hh?.fin} />
          </div>
        );
      })}
    </div>
  );
}
