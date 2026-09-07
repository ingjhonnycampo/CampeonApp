import { useRef, useState, useCallback } from 'react';

let contexto = null;

function obtenerContexto() {
  if (!contexto) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    contexto = new Ctx();
  }
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}

// Un pitido de silbato de árbitro real "tiembla" (la bolita adentro vibra contra
// el aire) — eso se simula con un tono agudo cuya frecuencia oscila rápido
// (vibrato), en vez de un tono puro y plano que suena más a timbre de microondas.
function unPitido(inicioEn, duracion = 0.32) {
  const ctx = obtenerContexto();
  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  const ganancia = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.value = 2900;

  vibrato.type = 'sine';
  vibrato.frequency.value = 26; // velocidad del temblor de la bolita
  vibratoGain.gain.value = 180; // qué tanto se mueve la frecuencia (en Hz)
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);

  ganancia.gain.setValueAtTime(0.0001, inicioEn);
  ganancia.gain.exponentialRampToValueAtTime(0.3, inicioEn + 0.015);
  ganancia.gain.setValueAtTime(0.3, inicioEn + duracion - 0.06);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicioEn + duracion);

  osc.connect(ganancia);
  ganancia.connect(ctx.destination);

  vibrato.start(inicioEn);
  osc.start(inicioEn);
  vibrato.stop(inicioEn + duracion + 0.02);
  osc.stop(inicioEn + duracion + 0.02);
}

// Los navegadores bloquean el audio hasta que el usuario interactúa con la
// página. Este botón/llamado (dentro de un click real) desbloquea el contexto
// para que los pitidos automáticos que vengan después sí se escuchen.
export function activarSonido() {
  try {
    obtenerContexto();
  } catch {
    // Sin soporte de audio en este navegador; no pasa nada, la página sigue igual.
  }
}

// cantidad de pitidos cortos seguidos (1 = un evento normal o inicio de un
// tiempo, 2 = fin de un tiempo, 3 = fin del partido), como un árbitro real.
export function sonarPitido(cantidad = 1) {
  try {
    const ctx = obtenerContexto();
    const ahora = ctx.currentTime;
    for (let i = 0; i < cantidad; i++) {
      unPitido(ahora + i * 0.35);
    }
  } catch {
    // Si el navegador bloquea audio autonomo (sin interaccion previa del usuario)
    // simplemente no suena; no es un error que deba interrumpir la pagina.
  }
}

const TEXTO_TRANSICION = {
  primer_tiempo: { texto: 'Inició el partido', cantidad: 1 },
  descanso: { texto: 'Finalizó el primer tiempo', cantidad: 2 },
  segundo_tiempo: { texto: 'Inició el segundo tiempo', cantidad: 1 },
  finalizado: { texto: 'Finalizó el partido', cantidad: 3 }
};

// Suena el pitido y deja un aviso visual (con icono de pito) unos segundos en
// pantalla, para que quede claro qué fue lo que pasó, no solo que se oiga algo.
// Lo usan tanto las transiciones de tiempo (procesar) como los goles/tarjetas/
// cambios que detecta cada fila de partido en vivo (via el prop onEvento).
export function usePitidos() {
  const estadosPrevios = useRef({});
  const [avisos, setAvisos] = useState([]);

  const anunciar = useCallback((texto, equipos, cantidad = 1) => {
    sonarPitido(cantidad);
    const id = `${Math.random().toString(36).slice(2)}-${Date.now()}`;
    setAvisos((actuales) => [...actuales, { id, texto, equipos }]);
    setTimeout(() => setAvisos((actuales) => actuales.filter((a) => a.id !== id)), 6000);
  }, []);

  // Detecta cambios de tiempo_actual entre una llamada y la siguiente.
  const procesar = useCallback((partidos) => {
    partidos.forEach((p) => {
      const anterior = estadosPrevios.current[p.id];
      const transicion = anterior !== undefined && anterior !== p.tiempo_actual ? TEXTO_TRANSICION[p.tiempo_actual] : null;
      if (transicion) {
        anunciar(transicion.texto, `${p.equipo_local_nombre} vs ${p.equipo_visitante_nombre}`, transicion.cantidad);
      }
      estadosPrevios.current[p.id] = p.tiempo_actual;
    });
  }, [anunciar]);

  return { avisos, procesar, anunciar };
}
