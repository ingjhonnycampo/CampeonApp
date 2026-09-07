// Cuadro visual de la fase eliminatoria (tipo llaves de mundial): una columna por
// ronda, cada partido como una caja con el escudo y el nombre de cada equipo, y
// líneas que conectan cada cruce con la casilla de la ronda siguiente. Se llena
// solo a medida que hay resultados — mientras no se sepa un equipo, muestra la
// etiqueta de "por definir" (posición o "Ganador Llave N").
//
// Las llaves a ida y vuelta se dibujan como una mini-tabla dentro de la misma
// casilla: encabezado (Ida / Vta / Global) y, por cada equipo, sus tres números
// en esas columnas — no un solo marcador apilado.

const BOX_W = 250;
const ROW_H = 32;
const BOX_H = ROW_H * 2;
const ROW_H_DOBLE = 30;
const HEADER_H = 18;
const BOX_H_DOBLE = HEADER_H + ROW_H_DOBLE * 2;
const ROUND_GAP = 70;

function calcularLayout(rondas, gapY0, alturas) {
  const posiciones = {};
  rondas[0].forEach((p, i) => {
    posiciones[p.id] = { x: 0, y: i * (alturas[0] + gapY0) };
  });
  for (let r = 1; r < rondas.length; r++) {
    const x = r * (BOX_W + ROUND_GAP);
    rondas[r].forEach((p, i) => {
      const a = rondas[r - 1][i * 2];
      const b = rondas[r - 1][i * 2 + 1];
      const ay = posiciones[a.id].y + alturas[r - 1] / 2;
      const by = b ? posiciones[b.id].y + alturas[r - 1] / 2 : ay;
      posiciones[p.id] = { x, y: (ay + by) / 2 - alturas[r] / 2 };
    });
  }
  const totalWidth = rondas.length * BOX_W + (rondas.length - 1) * ROUND_GAP;
  const totalHeight = (rondas[0].length - 1) * (alturas[0] + gapY0) + alturas[0];
  return { posiciones, totalWidth, totalHeight };
}

function FilaEquipo({ nombre, escudo, goles, gana, pendiente }) {
  return (
    <div className={'cuadro-fila' + (gana ? ' cuadro-fila--gana' : '')}>
      {escudo ? <img src={escudo} alt="" /> : <span className="cuadro-escudo-vacio" />}
      <span className="cuadro-nombre">{nombre || pendiente || 'Por definir'}{gana && ' *'}</span>
      {goles !== null && goles !== undefined && <span className="cuadro-goles">{goles}</span>}
    </div>
  );
}

// Casilla de una llave a ida y vuelta: encabezado con Ida/Vta/Global y, por cada
// equipo, sus tres números en esas mismas columnas.
function FilaEquipoDoble({ nombre, escudo, ida, vta, global, gana, pendiente }) {
  return (
    <div className={'cuadro-fila-doble' + (gana ? ' cuadro-fila-doble--gana' : '')} style={{ height: ROW_H_DOBLE }}>
      {escudo ? <img src={escudo} alt="" /> : <span className="cuadro-escudo-vacio" />}
      <span className="cuadro-nombre">{nombre || pendiente || 'Por definir'}{gana && ' *'}</span>
      <span className="cuadro-col-doble">{ida}</span>
      <span className="cuadro-col-doble">{vta}</span>
      <span className="cuadro-col-doble cuadro-col-global">{global}</span>
    </div>
  );
}

export default function CuadroBracket({ partidos }) {
  // Las "vueltas" (partido_ida_id no nulo) no cuentan como casilla aparte del
  // cuadro: se muestran fundidas en la casilla de su ida, con el marcador global.
  const finales = partidos.filter((p) => !p.es_tercer_puesto && !p.partido_ida_id).sort((a, b) => a.jornada - b.jornada || a.id - b.id);
  const vueltasPorIda = Object.fromEntries(partidos.filter((p) => p.partido_ida_id).map((v) => [v.partido_ida_id, v]));
  const tercerPuesto = partidos.find((p) => p.es_tercer_puesto);
  const jornadas = [...new Set(finales.map((p) => p.jornada))].sort((a, b) => a - b);
  const rondas = jornadas.map((j) => finales.filter((p) => p.jornada === j));

  if (rondas.length === 0) return null;

  // Cada ronda es toda a ida-y-vuelta o toda a partido único (la final SIEMPRE es
  // única), asi que basta con mirar el primer partido de cada ronda para saber su
  // alto.
  const alturas = rondas.map((ronda) => (vueltasPorIda[ronda[0]?.id] ? BOX_H_DOBLE : BOX_H));
  const { posiciones, totalWidth, totalHeight } = calcularLayout(rondas, 16, alturas);

  return (
    <div className="cuadro-scroll">
      <div className="cuadro-bracket" style={{ width: totalWidth, height: totalHeight + 40 }}>
        <svg className="cuadro-lineas" width={totalWidth} height={totalHeight}>
          {rondas.slice(0, -1).map((ronda, r) =>
            ronda.map((p, i) => {
              if (i % 2 !== 0) return null;
              const a = posiciones[p.id];
              const bPartido = ronda[i + 1];
              const b = bPartido ? posiciones[bPartido.id] : null;
              const siguiente = rondas[r + 1][i / 2];
              const next = posiciones[siguiente.id];
              const ay = a.y + alturas[r] / 2;
              const by = b ? b.y + alturas[r] / 2 : ay;
              const midX = a.x + BOX_W + ROUND_GAP / 2;
              return (
                <g key={p.id + '-conn'} className="cuadro-linea">
                  <line x1={a.x + BOX_W} y1={ay} x2={midX} y2={ay} />
                  {b && <line x1={b.x + BOX_W} y1={by} x2={midX} y2={by} />}
                  {b && <line x1={midX} y1={ay} x2={midX} y2={by} />}
                  <line x1={midX} y1={next.y + alturas[r + 1] / 2} x2={next.x} y2={next.y + alturas[r + 1] / 2} />
                </g>
              );
            })
          )}
        </svg>

        {rondas.map((ronda, r) => (
          <div key={r} className="cuadro-ronda-titulo" style={{ left: r * (BOX_W + ROUND_GAP), width: BOX_W }}>
            {ronda[0]?.ronda_nombre}
          </div>
        ))}

        {finales.map((p) => {
          const pos = posiciones[p.id];
          const vuelta = vueltasPorIda[p.id];
          const ambosJugados = p.estado === 'jugado' && (!vuelta || vuelta.estado === 'jugado');

          let golesLocal = null;
          let golesVisitante = null;
          let ganadorLocal = false;
          let ganadorVisitante = false;
          if (ambosJugados) {
            if (vuelta) {
              golesLocal = p.goles_local + vuelta.goles_visitante;
              golesVisitante = p.goles_visitante + vuelta.goles_local;
              const ganadorId = (golesLocal === golesVisitante ? vuelta.ganador_id : null) ||
                (golesLocal > golesVisitante ? p.equipo_local_id : golesVisitante > golesLocal ? p.equipo_visitante_id : null);
              ganadorLocal = ganadorId === p.equipo_local_id;
              ganadorVisitante = ganadorId === p.equipo_visitante_id;
            } else {
              golesLocal = p.goles_local;
              golesVisitante = p.goles_visitante;
              ganadorLocal = p.ganador_id ? p.ganador_id === p.equipo_local_id : p.goles_local > p.goles_visitante;
              ganadorVisitante = p.ganador_id ? p.ganador_id === p.equipo_visitante_id : p.goles_visitante > p.goles_local;
            }
          }

          if (!vuelta) {
            return (
              <div key={p.id} className="cuadro-partido" style={{ left: pos.x, top: pos.y + 32, width: BOX_W, height: BOX_H }}>
                <FilaEquipo nombre={p.equipo_local_nombre} escudo={p.equipo_local_escudo} goles={golesLocal} gana={ganadorLocal} pendiente={p.pendiente_local} />
                <FilaEquipo nombre={p.equipo_visitante_nombre} escudo={p.equipo_visitante_escudo} goles={golesVisitante} gana={ganadorVisitante} pendiente={p.pendiente_visitante} />
                {p.penales_local != null && (
                  <span className="cuadro-global-nota">Pen. {p.penales_local}-{p.penales_visitante}</span>
                )}
              </div>
            );
          }

          // Con vuelta: la vuelta juega con local/visitante invertidos respecto a la
          // ida, asi que sus goles y penales se voltean al mostrarlos para que
          // ambas columnas queden en el mismo orden que el nombre de cada equipo.
          const filaConPenales = p.penales_local != null ? p : (vuelta.penales_local != null ? vuelta : null);
          const penLocal = filaConPenales ? (filaConPenales === vuelta ? filaConPenales.penales_visitante : filaConPenales.penales_local) : null;
          const penVisitante = filaConPenales ? (filaConPenales === vuelta ? filaConPenales.penales_local : filaConPenales.penales_visitante) : null;

          const idaLocal = p.estado === 'jugado' ? p.goles_local : '-';
          const idaVisitante = p.estado === 'jugado' ? p.goles_visitante : '-';
          const vtaLocal = vuelta.estado === 'jugado' ? vuelta.goles_visitante : '-';
          const vtaVisitante = vuelta.estado === 'jugado' ? vuelta.goles_local : '-';
          const globalLocal = ambosJugados ? `${golesLocal}${filaConPenales ? ` (${penLocal})` : ''}` : '-';
          const globalVisitante = ambosJugados ? `${golesVisitante}${filaConPenales ? ` (${penVisitante})` : ''}` : '-';

          return (
            <div key={p.id} className="cuadro-partido cuadro-partido--doble" style={{ left: pos.x, top: pos.y + 32, width: BOX_W, height: BOX_H_DOBLE }}>
              <div className="cuadro-fila-doble cuadro-fila-doble--encabezado" style={{ height: HEADER_H }}>
                <span className="cuadro-nombre"></span>
                <span className="cuadro-col-doble">Ida</span>
                <span className="cuadro-col-doble">Vta</span>
                <span className="cuadro-col-doble cuadro-col-global">Global</span>
              </div>
              <FilaEquipoDoble nombre={p.equipo_local_nombre} escudo={p.equipo_local_escudo} ida={idaLocal} vta={vtaLocal} global={globalLocal} gana={ganadorLocal} pendiente={p.pendiente_local} />
              <FilaEquipoDoble nombre={p.equipo_visitante_nombre} escudo={p.equipo_visitante_escudo} ida={idaVisitante} vta={vtaVisitante} global={globalVisitante} gana={ganadorVisitante} pendiente={p.pendiente_visitante} />
            </div>
          );
        })}
      </div>

      {tercerPuesto && (
        <div className="cuadro-tercer-puesto">
          <span className="cuadro-ronda-titulo cuadro-ronda-titulo--estatico">Partido por el 3er puesto</span>
          <div className="cuadro-partido cuadro-partido--estatico">
            <FilaEquipo
              nombre={tercerPuesto.equipo_local_nombre} escudo={tercerPuesto.equipo_local_escudo}
              goles={tercerPuesto.estado === 'jugado' ? tercerPuesto.goles_local : null}
              gana={tercerPuesto.estado === 'jugado' && (tercerPuesto.ganador_id ? tercerPuesto.ganador_id === tercerPuesto.equipo_local_id : tercerPuesto.goles_local > tercerPuesto.goles_visitante)}
              pendiente={tercerPuesto.pendiente_local}
            />
            <FilaEquipo
              nombre={tercerPuesto.equipo_visitante_nombre} escudo={tercerPuesto.equipo_visitante_escudo}
              goles={tercerPuesto.estado === 'jugado' ? tercerPuesto.goles_visitante : null}
              gana={tercerPuesto.estado === 'jugado' && (tercerPuesto.ganador_id ? tercerPuesto.ganador_id === tercerPuesto.equipo_visitante_id : tercerPuesto.goles_visitante > tercerPuesto.goles_local)}
              pendiente={tercerPuesto.pendiente_visitante}
            />
          </div>
        </div>
      )}
    </div>
  );
}
