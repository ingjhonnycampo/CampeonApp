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

// Linea de tiempo del partido agrupada por tiempo (1er/2do), con dos columnas
// (local a la izquierda, visitante a la derecha) en orden cronológico dentro de
// cada tiempo, y los hitos del cronómetro (inicio/fin de cada tiempo) como filas
// centradas al principio y al final de cada sección. La usan tanto el informe
// imprimible como la vista pública en vivo.
export default function LineaTiempoPartido({ partido, goles, tarjetas, cambios, hitos = [] }) {
  const todos = [
    ...goles.map((g) => ({ ...g, _tipo: 'gol' })),
    ...tarjetas.map((t) => ({ ...t, _tipo: 'tarjeta' })),
    ...cambios.map((c) => ({ ...c, _tipo: 'cambio' }))
  ];

  const porTiempo = { primer_tiempo: [], segundo_tiempo: [], sin_tiempo: [] };
  todos.forEach((ev) => { (porTiempo[ev.tiempo] || porTiempo.sin_tiempo).push(ev); });
  Object.values(porTiempo).forEach((lista) => lista.sort((a, b) =>
    (a.minuto ?? 0) - (b.minuto ?? 0) || (a.minuto_adicion ?? 0) - (b.minuto_adicion ?? 0) || a.id - b.id
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

  return (
    <div className="linea-tiempo">
      {secciones.map(([clave, eventos]) => {
        const local = eventos.filter((e) => e.equipo_id === partido.equipo_local_id);
        const visitante = eventos.filter((e) => e.equipo_id === partido.equipo_visitante_id);
        const filas = Math.max(local.length, visitante.length);
        const hh = hitosPorTiempo[clave];
        return (
          <div key={clave} className="linea-tiempo-seccion">
            <h4 className="linea-tiempo-titulo">{ETIQUETA_SECCION[clave]}</h4>
            <FilaHito hito={hh?.inicio} />
            {Array.from({ length: filas }).map((_, i) => (
              <div key={i} className="linea-tiempo-fila">
                <div className="linea-tiempo-celda linea-tiempo-celda--local">
                  {local[i] && (
                    <>
                      <span className="linea-tiempo-minuto">{etiquetaMinuto(local[i].minuto, local[i].minuto_adicion)}</span>
                      <span><EventoTexto ev={local[i]} /></span>
                    </>
                  )}
                </div>
                <div className="linea-tiempo-celda linea-tiempo-celda--visitante">
                  {visitante[i] && (
                    <>
                      <span><EventoTexto ev={visitante[i]} /></span>
                      <span className="linea-tiempo-minuto">{etiquetaMinuto(visitante[i].minuto, visitante[i].minuto_adicion)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
            <FilaHito hito={hh?.fin} />
          </div>
        );
      })}
    </div>
  );
}
