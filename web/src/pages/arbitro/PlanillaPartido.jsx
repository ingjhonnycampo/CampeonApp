import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import CargaJugador from '../../components/CargaJugador';
import FirmaPad from '../../components/FirmaPad';
import { maxTitulares as maxTitularesDe, usaAlineacionFormal, permiteTarjetaAzul } from '../../lib/modalidad';
import { edadSiCumpleRegla } from '../../lib/edad';

// Muestra la edad de un jugador en rojo cuando cumple alguna regla de edad "en
// cancha" del torneo (ej. "mínimo 2 jugadores de 35+ años") — para que el
// árbitro/anotador lo identifique de un vistazo, sin importar si la modalidad
// exige alineación formal o los cambios son libres.
function EdadMayor({ jugador, reglasCancha }) {
  const edad = edadSiCumpleRegla(jugador, reglasCancha, new Date());
  if (edad === null) return null;
  return <span className="planilla-edad-mayor">{edad} años</span>;
}

export default function PlanillaPartido() {
  const { partidoId } = useParams();
  const { usuario } = useAuth();
  const modal = useModal();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const soloLectura = usuario.rol !== 'arbitro';
  const volverA = usuario.rol === 'admin' || usuario.rol === 'organizador' ? '/admin' : '/arbitro';

  useEffect(() => { cargar(); }, [partidoId]);

  async function cargar() {
    try {
      const data = await api(`/planilla/${partidoId}`);
      setDatos(data);
    } catch (err) {
      await modal.error(err.message, 'No se pudo cargar la planilla');
    } finally {
      setCargando(false);
    }
  }

  if (cargando) return <CargaJugador texto="Cargando la planilla..." />;
  if (!datos) return <p className="admin-empty">No se pudo cargar este partido.</p>;

  const { partido } = datos;

  return (
    <div className="dashboard-placeholder">
      <header>
        <div className="dashboard-brand">
          <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
          <div>
            <Link to={volverA} className="admin-volver">← Volver al menú</Link>
            <h1>{partido.equipo_local_nombre} vs {partido.equipo_visitante_nombre}</h1>
          </div>
        </div>
      </header>

      {soloLectura && (
        <p className="planilla-aviso-solo-lectura">Estás viendo esta planilla en modo solo lectura. Solo el árbitro/anotador asignado puede gestionarla.</p>
      )}

      {(partido.estado === 'programado' || partido.estado === 'reprogramado') && (
        <PrePartido datos={datos} onListo={cargar} soloLectura={soloLectura} />
      )}
      {partido.estado === 'en_curso' && <PlanillaEnVivo datos={datos} onCambio={cargar} soloLectura={soloLectura} />}
      {partido.estado === 'jugado' && <ResumenPartido datos={datos} onCambio={cargar} soloLectura={soloLectura} />}
    </div>
  );
}

function puedeIniciarYa(partido) {
  return !!partido.fecha_hora && new Date(partido.fecha_hora) <= new Date();
}

function AvisoHorario({ partido }) {
  if (!partido.fecha_hora) {
    return <p className="admin-empty planilla-aviso-horario">Este partido todavía no tiene fecha y hora programada. Pídele al organizador que la programe antes de poder iniciarlo.</p>;
  }
  if (!puedeIniciarYa(partido)) {
    const fechaTexto = new Date(partido.fecha_hora).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    return <p className="admin-empty planilla-aviso-horario">Este partido inicia el {fechaTexto}. No se puede iniciar antes de esa hora.</p>;
  }
  return null;
}

function PrePartido({ datos, onListo, soloLectura }) {
  const { partido } = datos;
  if (!usaAlineacionFormal(partido.modalidad)) {
    return <IniciarMicrofutbol datos={datos} onListo={onListo} soloLectura={soloLectura} />;
  }
  return <ArmarAlineacion datos={datos} onListo={onListo} soloLectura={soloLectura} />;
}

function IniciarMicrofutbol({ datos, onListo, soloLectura }) {
  const modal = useModal();
  const { partido, convocadosLocal, convocadosVisitante, reglasCancha } = datos;
  const [iniciando, setIniciando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const habilitado = puedeIniciarYa(partido);
  const ambosConfirmados = partido.confirmado_local && partido.confirmado_visitante;

  async function iniciar() {
    setIniciando(true);
    try {
      await api(`/planilla/${partido.id}/iniciar`, { method: 'POST' });
      await onListo();
    } catch (err) {
      await modal.error(err.message, 'No se pudo iniciar el partido');
    } finally {
      setIniciando(false);
    }
  }

  async function confirmarEquipo(lado) {
    setConfirmando(true);
    try {
      await api(`/planilla/${partido.id}/confirmar-equipo`, { method: 'POST', body: JSON.stringify({ lado }) });
      await onListo();
    } catch (err) {
      await modal.error(err.message, 'No se pudo confirmar el equipo');
    } finally {
      setConfirmando(false);
    }
  }

  function ListaEquipo({ titulo, equipoId, jugadores }) {
    const lado = equipoId === partido.equipo_local_id ? 'local' : 'visitante';
    const firmaOk = !!(lado === 'local' ? partido.firma_delegado_local : partido.firma_delegado_visitante);
    const confirmado = lado === 'local' ? partido.confirmado_local : partido.confirmado_visitante;
    return (
      <section className="admin-card">
        <h2>{titulo}{confirmado && <span className="admin-badge-sorteado" style={{ marginLeft: 8 }}>Confirmado</span>}</h2>
        <PanelFirmaDelegado
          titulo={`Firma del delegado — ${titulo}`}
          lado={lado} partido={partido} onCambio={onListo} soloLectura={soloLectura}
        />
        <div className="admin-list admin-list--alta">
          {jugadores.map((j) => (
            <div key={j.id} className="admin-item admin-item--estatico">
              <span><strong>#{j.numero_camiseta ?? '-'}</strong> {j.nombre} <EdadMayor jugador={j} reglasCancha={reglasCancha} /></span>
              {j.expulsado
                ? <span className="planilla-badge-sancionado planilla-badge-sancionado--expulsado">⛔ Expulsado del campeonato</span>
                : j.suspendido && <span className="planilla-badge-sancionado">🚫 Sancionado</span>}
            </div>
          ))}
          {jugadores.length === 0 && <p className="admin-empty">Este equipo todavía no tiene jugadores validados.</p>}
        </div>
        {!soloLectura && !confirmado && (
          <>
            <button type="button" className="subida-imagen-btn" onClick={() => confirmarEquipo(lado)} disabled={confirmando || !firmaOk}>
              Confirmar equipo
            </button>
            {!firmaOk && <p className="admin-empty">El delegado debe firmar la planilla antes de confirmar el equipo.</p>}
          </>
        )}
      </section>
    );
  }

  return (
    <>
      <p className="admin-empty">Microfútbol: no se maneja alineación titular/suplente — los cambios son ilimitados durante el partido.</p>
      <div className="planilla-equipos-grid">
        <ListaEquipo titulo={partido.equipo_local_nombre} equipoId={partido.equipo_local_id} jugadores={convocadosLocal} />
        <ListaEquipo titulo={partido.equipo_visitante_nombre} equipoId={partido.equipo_visitante_id} jugadores={convocadosVisitante} />
      </div>
      <section className="admin-card">
        <AvisoHorario partido={partido} />
        {soloLectura ? (
          <p className="admin-empty">Solo el árbitro/anotador puede iniciar este partido.</p>
        ) : (
          <>
            <button type="button" className="subida-imagen-btn" onClick={iniciar} disabled={!habilitado || !ambosConfirmados || iniciando}>
              {iniciando ? 'Iniciando...' : 'Iniciar partido'}
            </button>
            {!ambosConfirmados && <p className="admin-empty">Confirma los dos equipos para poder iniciar.</p>}
          </>
        )}
      </section>
    </>
  );
}

function ArmarAlineacion({ datos, onListo, soloLectura }) {
  const modal = useModal();
  const { partido, convocadosLocal, convocadosVisitante, reglasCancha } = datos;
  const [seleccion, setSeleccion] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const maxTitulares = maxTitularesDe(partido.modalidad) || 11;

  function estadoDe(jugadorId) {
    return seleccion[jugadorId] || 'no';
  }

  function contarTitulares(jugadores) {
    return jugadores.filter((j) => estadoDe(j.id) === 'titular').length;
  }

  async function elegir(jugadorId, valor, jugadores) {
    if (soloLectura) return;
    if (valor !== 'no' && jugadores.find((j) => j.id === jugadorId)?.suspendido) {
      await modal.error('Este jugador está sancionado y no puede jugar este partido hasta que el organizador/admin lo habilite.', 'Jugador sancionado');
      return;
    }
    if (valor === 'titular' && estadoDe(jugadorId) !== 'titular' && contarTitulares(jugadores) >= maxTitulares) {
      await modal.error(`No puede haber más de ${maxTitulares} titulares. Quita uno antes de agregar otro.`, 'Límite de titulares');
      return;
    }
    setSeleccion((s) => ({ ...s, [jugadorId]: valor }));
  }

  async function guardarEquipo(equipoId, jugadores) {
    const titulares = jugadores.filter((j) => estadoDe(j.id) === 'titular').map((j) => j.id);
    const suplentes = jugadores.filter((j) => estadoDe(j.id) === 'suplente').map((j) => j.id);
    if (titulares.length === 0) {
      await modal.error('Marca al menos un jugador titular.', 'Falta la alineación');
      return;
    }
    setGuardando(true);
    try {
      await api(`/planilla/${partido.id}/alineacion`, {
        method: 'PUT',
        body: JSON.stringify({ equipo_id: equipoId, titulares, suplentes })
      });
      await modal.exito('Alineación guardada.');
      await onListo();
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar la alineación');
    } finally {
      setGuardando(false);
    }
  }

  async function iniciar() {
    setIniciando(true);
    try {
      await api(`/planilla/${partido.id}/iniciar`, { method: 'POST' });
      await onListo();
    } catch (err) {
      await modal.error(err.message, 'No se pudo iniciar el partido');
    } finally {
      setIniciando(false);
    }
  }

  function EquipoAlineacion({ titulo, equipoId, jugadores }) {
    const yaGuardada = datos.alineacion.some((a) => a.equipo_id === equipoId);
    const cantidadTitulares = contarTitulares(jugadores);
    const lado = equipoId === partido.equipo_local_id ? 'local' : 'visitante';
    const firmaOk = !!(lado === 'local' ? partido.firma_delegado_local : partido.firma_delegado_visitante);
    return (
      <section className="admin-card">
        <h2>{titulo}{yaGuardada && <span className="admin-badge-sorteado" style={{ marginLeft: 8 }}>Guardada</span>}</h2>
        <PanelFirmaDelegado
          titulo={`Firma del delegado — ${titulo}`}
          lado={lado} partido={partido} onCambio={onListo} soloLectura={soloLectura}
        />
        <p className={'admin-empty' + (cantidadTitulares >= maxTitulares ? ' planilla-titulares-completo' : '')}>
          {cantidadTitulares} de {maxTitulares} titulares{cantidadTitulares >= maxTitulares ? ' — ¡completo!' : ''}
        </p>
        <div className="planilla-alineacion-lista">
          {jugadores.map((j) => (
            <div key={j.id} className="planilla-alineacion-fila">
              <span className="planilla-jugador-numero">{j.numero_camiseta ?? '-'}</span>
              <span className="planilla-alineacion-nombre">
                {j.nombre} <EdadMayor jugador={j} reglasCancha={reglasCancha} />
                {j.expulsado
                ? <span className="planilla-badge-sancionado planilla-badge-sancionado--expulsado">⛔ Expulsado del campeonato</span>
                : j.suspendido && <span className="planilla-badge-sancionado">🚫 Sancionado</span>}
              </span>
              <div className="planilla-segmentado">
                {['no', 'titular', 'suplente'].map((valor) => (
                  <button
                    key={valor} type="button" disabled={soloLectura || (valor !== 'no' && j.suspendido)}
                    className={'planilla-segmentado-btn' + (estadoDe(j.id) === valor ? ' planilla-segmentado-btn--activo planilla-segmentado-btn--' + valor : '')}
                    onClick={() => elegir(j.id, valor, jugadores)}
                  >
                    {valor === 'no' ? 'No convocado' : valor === 'titular' ? 'Titular' : 'Suplente'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!soloLectura && (
          <>
            <button type="button" className="subida-imagen-btn" onClick={() => guardarEquipo(equipoId, jugadores)} disabled={guardando || !firmaOk}>
              Guardar alineación de {titulo}
            </button>
            {!firmaOk && <p className="admin-empty">El delegado debe firmar la planilla antes de guardar la alineación.</p>}
          </>
        )}
      </section>
    );
  }

  const ambasGuardadas = datos.alineacion.length > 0 &&
    [partido.equipo_local_id, partido.equipo_visitante_id].every((id) => datos.alineacion.some((a) => a.equipo_id === id && a.titular));
  const habilitado = puedeIniciarYa(partido);

  return (
    <>
      <p className="admin-empty">Marca titulares y suplentes de cada equipo, guarda cada alineación, y luego dale a "Iniciar partido".</p>
      <div className="planilla-equipos-grid">
        <EquipoAlineacion titulo={partido.equipo_local_nombre} equipoId={partido.equipo_local_id} jugadores={convocadosLocal} />
        <EquipoAlineacion titulo={partido.equipo_visitante_nombre} equipoId={partido.equipo_visitante_id} jugadores={convocadosVisitante} />
      </div>
      <section className="admin-card">
        <AvisoHorario partido={partido} />
        {soloLectura ? (
          <p className="admin-empty">Solo el árbitro/anotador puede armar la alineación e iniciar este partido.</p>
        ) : (
          <>
            <button type="button" className="subida-imagen-btn" onClick={iniciar} disabled={!ambasGuardadas || !habilitado || iniciando}>
              {iniciando ? 'Iniciando...' : 'Iniciar partido'}
            </button>
            {!ambasGuardadas && <p className="admin-empty">Guarda la alineación titular de los dos equipos para poder iniciar.</p>}
          </>
        )}
      </section>
    </>
  );
}

function jugadoresEnCancha(alineacion, equipoId) {
  return alineacion.filter((a) => a.equipo_id === equipoId && (a.titular ? a.salio_minuto == null : a.entro_minuto != null));
}

function formatoReloj(totalSeg) {
  const seg = Math.max(0, totalSeg);
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useCronometro(partido) {
  const [ahora, setAhora] = useState(Date.now());
  const corriendo = !!partido.cronometro_inicio;

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [corriendo, partido.cronometro_inicio]);

  const segundosCorridos = corriendo ? Math.floor((ahora - new Date(partido.cronometro_inicio).getTime()) / 1000) : 0;
  const totalSeg = (partido.cronometro_acumulado_seg || 0) + segundosCorridos;
  return { totalSeg, corriendo };
}

const ETIQUETA_TIEMPO = {
  primer_tiempo: 'Primer tiempo',
  descanso: 'Descanso',
  segundo_tiempo: 'Segundo tiempo',
  finalizado: 'Tiempo cumplido'
};

function Cronometro({ partido, onCambio, soloLectura }) {
  const modal = useModal();
  const { totalSeg, corriendo } = useCronometro(partido);
  const [enviando, setEnviando] = useState(false);
  const duracionMin = partido.tiempo_actual === 'segundo_tiempo' ? partido.duracion_tiempo_2 : partido.duracion_tiempo_1;
  const duracionSeg = (duracionMin || 0) * 60;
  const cumplido = ['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && duracionSeg > 0 && totalSeg >= duracionSeg;
  const segAdicion = cumplido ? totalSeg - duracionSeg : 0;

  async function accion(ruta) {
    setEnviando(true);
    try {
      await api(`/planilla/${partido.id}/cronometro/${ruta}`, { method: 'POST' });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo actualizar el cronómetro');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={'planilla-cronometro' + (cumplido ? ' planilla-cronometro--cumplido' : '')}>
      <span className="planilla-cronometro-etiqueta">{ETIQUETA_TIEMPO[partido.tiempo_actual] || 'Antes del partido'}</span>
      <span className="planilla-cronometro-reloj">{formatoReloj(cumplido ? duracionSeg : totalSeg)}</span>
      {cumplido && (
        <span className="planilla-cronometro-adicion">+ {formatoReloj(segAdicion)}</span>
      )}
      {cumplido && <span className="planilla-cronometro-aviso">¡Se cumplió el tiempo reglamentario ({duracionMin}')! Corriendo tiempo de adición.</span>}
      {!corriendo && (
        <span className="planilla-cronometro-nota">
          {partido.tiempo_actual == null && 'Todavía se pueden mostrar tarjetas, pero los goles solo se anotan con el cronómetro corriendo.'}
          {partido.tiempo_actual === 'descanso' && 'En descanso también se pueden mostrar tarjetas, pero no goles.'}
          {['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && 'Cronómetro en pausa: no se pueden anotar goles hasta reanudarlo.'}
        </span>
      )}
      {!soloLectura && (
        <div className="planilla-cronometro-botones">
          {partido.tiempo_actual == null && (
            <button type="button" className="admin-btn-ok" onClick={() => accion('iniciar-tiempo')} disabled={enviando}>Iniciar primer tiempo</button>
          )}
          {partido.tiempo_actual === 'descanso' && (
            <button type="button" className="admin-btn-ok" onClick={() => accion('iniciar-tiempo')} disabled={enviando}>Iniciar segundo tiempo</button>
          )}
          {['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && (
            <>
              {corriendo ? (
                <button type="button" className="subida-imagen-btn" onClick={() => accion('pausar')} disabled={enviando}>Pausar</button>
              ) : (
                <button type="button" className="admin-btn-ok" onClick={() => accion('reanudar')} disabled={enviando}>Reanudar</button>
              )}
              <button type="button" className="admin-btn-mal" onClick={() => accion('finalizar-tiempo')} disabled={enviando}>
                Finalizar {partido.tiempo_actual === 'primer_tiempo' ? 'primer' : 'segundo'} tiempo
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const ETIQUETA_TIEMPO_CORTA = { primer_tiempo: 'PT', segundo_tiempo: 'ST' };

const ETIQUETA_HITO = {
  inicio_partido: 'Inicio del partido',
  fin_primer_tiempo: 'Fin del primer tiempo',
  inicio_segundo_tiempo: 'Inicio del segundo tiempo',
  fin_partido: 'Fin del partido'
};

function etiquetaMinuto(minuto, tiempo, minutoAdicion) {
  if (minuto == null || !tiempo) return '';
  const min = minutoAdicion != null ? `${minuto}+${minutoAdicion}'` : `${minuto}'`;
  return `${min} ${ETIQUETA_TIEMPO_CORTA[tiempo] || ''}`;
}

const ORDEN_TIEMPO = { primer_tiempo: 1, segundo_tiempo: 2 };

// Orden cronológico real: primero lo que no tiene tiempo asignado (tarjetas antes
// de iniciar o en el descanso), luego primer tiempo y segundo tiempo, cada uno por
// minuto ascendente.
function ordenarEventos(eventos) {
  return [...eventos].sort((a, b) => {
    const ta = ORDEN_TIEMPO[a.tiempo] || 0;
    const tb = ORDEN_TIEMPO[b.tiempo] || 0;
    return ta - tb || (a.minuto ?? 0) - (b.minuto ?? 0) || (a.minuto_adicion ?? 0) - (b.minuto_adicion ?? 0) || a.id - b.id;
  });
}

function cronometroCorriendo(partido) {
  return ['primer_tiempo', 'segundo_tiempo'].includes(partido.tiempo_actual) && !!partido.cronometro_inicio;
}

function PlanillaEnVivo({ datos, onCambio, soloLectura }) {
  const modal = useModal();
  const { partido, alineacion, goles, tarjetas, cambios, hitos, convocadosLocal, convocadosVisitante, reglasCancha } = datos;
  const usaAlineacion = usaAlineacionFormal(partido.modalidad);
  const puedeAnotarGol = cronometroCorriendo(partido) && !soloLectura;

  const [enviando, setEnviando] = useState(false);

  const jugadoresPorId = {};
  [...convocadosLocal, ...convocadosVisitante].forEach((j) => { jugadoresPorId[j.id] = j; });

  const enCanchaLocal = usaAlineacion ? jugadoresEnCancha(alineacion, partido.equipo_local_id) : null;
  const enCanchaVisitante = usaAlineacion ? jugadoresEnCancha(alineacion, partido.equipo_visitante_id) : null;
  const suplentesLocal = usaAlineacion ? alineacion.filter((a) => a.equipo_id === partido.equipo_local_id && !a.titular && a.entro_minuto == null) : [];
  const suplentesVisitante = usaAlineacion ? alineacion.filter((a) => a.equipo_id === partido.equipo_visitante_id && !a.titular && a.entro_minuto == null) : [];
  const todosEnCancha = usaAlineacion ? [...enCanchaLocal, ...enCanchaVisitante] : [];
  const idsEnCancha = new Set(todosEnCancha.map((a) => a.jugador_id));

  // Roja directa o doble amarilla: el jugador queda definitivamente fuera (el equipo
  // sigue con uno menos, no se puede "sacar" del campo porque ya no está jugando).
  function expulsadoDefinitivo(jugadorId) {
    const amarillas = tarjetas.filter((t) => t.jugador_id === jugadorId && t.tipo === 'amarilla').length;
    const roja = tarjetas.some((t) => t.jugador_id === jugadorId && t.tipo === 'roja');
    return roja || amarillas >= 2;
  }
  const paraSalirLocal = enCanchaLocal ? enCanchaLocal.filter((a) => !expulsadoDefinitivo(a.jugador_id)) : [];
  const paraSalirVisitante = enCanchaVisitante ? enCanchaVisitante.filter((a) => !expulsadoDefinitivo(a.jugador_id)) : [];

  async function registrarGol(jugadorId, enPropiaPuerta) {
    setEnviando(true);
    try {
      await api(`/planilla/${partido.id}/gol`, {
        method: 'POST',
        body: JSON.stringify({ jugador_id: jugadorId, en_propia_puerta: enPropiaPuerta })
      });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar el gol');
    } finally {
      setEnviando(false);
    }
  }

  async function registrarTarjeta(jugadorId, tipo) {
    setEnviando(true);
    try {
      const resultado = await api(`/planilla/${partido.id}/tarjeta`, {
        method: 'POST',
        body: JSON.stringify({ jugador_id: jugadorId, tipo })
      });
      await onCambio();
      if (resultado.expulsado_por_doble_amarilla) {
        await modal.error('Doble amarilla: el jugador queda expulsado del partido.', 'Expulsado');
      }
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar la tarjeta');
    } finally {
      setEnviando(false);
    }
  }

  async function quitarGol(golId) {
    const confirmado = await modal.confirmar({ titulo: '¿Quitar este gol?', textoAceptar: 'Quitar', peligro: true });
    if (!confirmado) return;
    await api(`/planilla/${partido.id}/gol/${golId}`, { method: 'DELETE' });
    await onCambio();
  }

  async function quitarTarjeta(tarjetaId) {
    const confirmado = await modal.confirmar({ titulo: '¿Quitar esta tarjeta?', textoAceptar: 'Quitar', peligro: true });
    if (!confirmado) return;
    await api(`/planilla/${partido.id}/tarjeta/${tarjetaId}`, { method: 'DELETE' });
    await onCambio();
  }

  async function quitarCambio(cambioId) {
    const confirmado = await modal.confirmar({ titulo: '¿Deshacer este cambio?', textoAceptar: 'Deshacer', peligro: true });
    if (!confirmado) return;
    await api(`/planilla/${partido.id}/cambio/${cambioId}`, { method: 'DELETE' });
    await onCambio();
  }

  async function hacerCambio(jugadorSaleId, jugadorEntraId) {
    setEnviando(true);
    try {
      await api(`/planilla/${partido.id}/cambio`, {
        method: 'PATCH',
        body: JSON.stringify({ jugador_sale_id: jugadorSaleId, jugador_entra_id: jugadorEntraId })
      });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo registrar el cambio');
    } finally {
      setEnviando(false);
    }
  }

  async function finalizar() {
    const empatado = partido.goles_local === partido.goles_visitante;
    let penales_local = null;
    let penales_visitante = null;
    if (empatado && partido.fase_id) {
      const resultado = await modal.penales({
        titulo: 'Empate — definición por penales',
        mensaje: 'El partido quedó empatado. Anota el marcador de la tanda de penales.',
        equipoLocal: partido.equipo_local_nombre,
        equipoVisitante: partido.equipo_visitante_nombre
      });
      if (!resultado) return;
      penales_local = resultado.local;
      penales_visitante = resultado.visitante;
    } else {
      const confirmado = await modal.confirmar({
        titulo: '¿Finalizar el partido?',
        mensaje: `Marcador final: ${partido.equipo_local_nombre} ${partido.goles_local} - ${partido.goles_visitante} ${partido.equipo_visitante_nombre}.`,
        textoAceptar: 'Finalizar'
      });
      if (!confirmado) return;
    }

    try {
      const resultado = await api(`/planilla/${partido.id}/finalizar`, {
        method: 'POST',
        body: JSON.stringify({ penales_local, penales_visitante })
      });
      if (resultado.aviso_clasificacion) {
        await modal.error(resultado.aviso_clasificacion, 'Revisa el cuadro eliminatorio');
      } else {
        await modal.exito('Partido finalizado.');
      }
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo finalizar el partido');
    }
  }

  function FilaJugador({ jugador, enBanca }) {
    const golesJugador = goles.filter((g) => g.jugador_id === jugador.id && !g.en_propia_puerta);
    const autogolesJugador = goles.filter((g) => g.jugador_id === jugador.id && g.en_propia_puerta);
    const amarillas = tarjetas.filter((t) => t.jugador_id === jugador.id && t.tipo === 'amarilla').length;
    const roja = tarjetas.some((t) => t.jugador_id === jugador.id && t.tipo === 'roja');
    const azul = tarjetas.some((t) => t.jugador_id === jugador.id && t.tipo === 'azul');
    const expulsado = roja || amarillas >= 2;
    const bloqueado = expulsado || azul;
    // En banca no se pueden anotar goles, pero sí se puede mostrar tarjeta (antes de
    // entrar o después de haber sido reemplazado). El gol además exige que el
    // cronómetro esté corriendo.
    const sinGol = enviando || enBanca || bloqueado || !puedeAnotarGol;
    const sinTarjeta = enviando || bloqueado || soloLectura;

    return (
      <div className={'planilla-jugador' + (enBanca ? ' planilla-jugador--banca' : '') + (bloqueado ? ' planilla-jugador--expulsado' : '')}>
        <span className="planilla-jugador-numero">{jugador.numero_camiseta ?? '-'}</span>
        <span className="planilla-jugador-info">
          {jugador.nombre} <EdadMayor jugador={jugador} reglasCancha={reglasCancha} />
          {enBanca && !bloqueado && <em className="planilla-jugador-tag">banca</em>}
          {expulsado && <em className="planilla-jugador-tag planilla-jugador-tag--expulsado">expulsado</em>}
          {!expulsado && azul && <em className="planilla-jugador-tag planilla-jugador-tag--azul">cambio obligatorio</em>}
        </span>
        <span className="planilla-jugador-marcas">
          {golesJugador.length > 0 && <span className="planilla-marca-gol">⚽×{golesJugador.length}</span>}
          {autogolesJugador.length > 0 && <span className="planilla-marca-gol planilla-marca-gol--og">OG×{autogolesJugador.length}</span>}
          {amarillas > 0 && <span className="planilla-marca-tarjeta planilla-marca-tarjeta--amarilla">{amarillas}</span>}
          {roja && <span className="planilla-marca-tarjeta planilla-marca-tarjeta--roja" />}
          {azul && <span className="planilla-marca-tarjeta planilla-marca-tarjeta--azul" />}
        </span>
        <span className="planilla-jugador-acciones">
          <button type="button" title="Gol" onClick={() => registrarGol(jugador.id, false)} disabled={sinGol}>⚽</button>
          <button type="button" title="Autogol" className="planilla-btn-og" onClick={() => registrarGol(jugador.id, true)} disabled={sinGol}>OG</button>
          <button type="button" title="Tarjeta amarilla" className="planilla-btn-amarilla" onClick={() => registrarTarjeta(jugador.id, 'amarilla')} disabled={sinTarjeta}>🟨</button>
          <button type="button" title="Tarjeta roja" className="planilla-btn-roja" onClick={() => registrarTarjeta(jugador.id, 'roja')} disabled={sinTarjeta}>🟥</button>
          {permiteTarjetaAzul(partido.modalidad) && (
            <button type="button" title="Tarjeta azul (cambio obligatorio)" className="planilla-btn-azul" onClick={() => registrarTarjeta(jugador.id, 'azul')} disabled={sinTarjeta}>🟦</button>
          )}
        </span>
      </div>
    );
  }

  function PanelCambio({ equipoNombre, enCancha, suplentes }) {
    const [saleId, setSaleId] = useState(null);

    async function elegirEntra(entraId) {
      if (!saleId) return;
      await hacerCambio(saleId, entraId);
      setSaleId(null);
    }

    if (enCancha.length === 0 || suplentes.length === 0) return null;

    return (
      <div className="planilla-cambio-panel">
        <h3>{equipoNombre}</h3>
        <div className="planilla-cambio-columnas">
          <div>
            <p className="planilla-cambio-etiqueta">Sale</p>
            <div className="planilla-cambio-lista">
              {enCancha.map((a) => (
                <button
                  key={a.jugador_id} type="button" disabled={enviando}
                  className={'planilla-cambio-jugador' + (saleId === a.jugador_id ? ' planilla-cambio-jugador--elegido' : '')}
                  onClick={() => setSaleId(a.jugador_id)}
                >
                  {jugadoresPorId[a.jugador_id]?.nombre} <EdadMayor jugador={jugadoresPorId[a.jugador_id] || {}} reglasCancha={reglasCancha} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="planilla-cambio-etiqueta">Entra</p>
            <div className="planilla-cambio-lista">
              {suplentes.map((a) => (
                <button
                  key={a.jugador_id} type="button" disabled={!saleId || enviando}
                  className="planilla-cambio-jugador"
                  onClick={() => elegirEntra(a.jugador_id)}
                >
                  {jugadoresPorId[a.jugador_id]?.nombre} <EdadMayor jugador={jugadoresPorId[a.jugador_id] || {}} reglasCancha={reglasCancha} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {!saleId && <p className="admin-empty">Elige primero quién sale, luego quién entra.</p>}
      </div>
    );
  }

  function ColumnaEquipo({ titulo, jugadores }) {
    return (
      <section className="admin-card planilla-columna-equipo">
        <h2>{titulo}</h2>
        <div className="planilla-jugadores-lista">
          {jugadores.map((j) => (
            <FilaJugador key={j.id} jugador={j} enBanca={usaAlineacion && !idsEnCancha.has(j.id)} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card">
        <h2 style={{ textAlign: 'center' }}>
          {partido.equipo_local_nombre} <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>{partido.goles_local} - {partido.goles_visitante}</span> {partido.equipo_visitante_nombre}
        </h2>
      </section>

      <Cronometro partido={partido} onCambio={onCambio} soloLectura={soloLectura} />

      <div className="planilla-equipos-grid">
        <ColumnaEquipo titulo={partido.equipo_local_nombre} jugadores={convocadosLocal} />
        <ColumnaEquipo titulo={partido.equipo_visitante_nombre} jugadores={convocadosVisitante} />
      </div>

      {!soloLectura && partido.tiempo_actual != null && usaAlineacion && (suplentesLocal.length > 0 || suplentesVisitante.length > 0) && (
        <section className="admin-card">
          <h2>Registrar cambio</h2>
          <PanelCambio equipoNombre={partido.equipo_local_nombre} enCancha={paraSalirLocal} suplentes={suplentesLocal} />
          <PanelCambio equipoNombre={partido.equipo_visitante_nombre} enCancha={paraSalirVisitante} suplentes={suplentesVisitante} />
        </section>
      )}

      <section className="admin-card">
        <h2>Eventos del partido</h2>
        <div className="admin-list admin-list--alta">
          {ordenarEventos([
            ...goles.map((g) => ({ ...g, _tipo: 'gol' })),
            ...tarjetas.map((t) => ({ ...t, _tipo: 'tarjeta' })),
            ...cambios.map((c) => ({ ...c, _tipo: 'cambio' })),
            ...hitos.map((h) => ({ ...h, _tipo: 'hito' }))
          ]).map((ev) => (
              <div key={`${ev._tipo}-${ev.id}`} className="admin-item admin-item--estatico">
                <span>
                  {ev.minuto != null ? `${etiquetaMinuto(ev.minuto, ev.tiempo, ev.minuto_adicion)} ` : ''}
                  {ev._tipo === 'gol' && `⚽ ${ev.jugador_nombre || 'Jugador'}${ev.en_propia_puerta ? ' (en propia puerta)' : ''}`}
                  {ev._tipo === 'tarjeta' && `${{ amarilla: '🟨', roja: '🟥', azul: '🟦' }[ev.tipo]} ${ev.jugador_nombre}`}
                  {ev._tipo === 'cambio' && `🔄 Sale ${ev.jugador_sale_nombre} — Entra ${ev.jugador_entra_nombre}`}
                  {ev._tipo === 'hito' && `🔔 ${ETIQUETA_HITO[ev.tipo]}`}
                </span>
                {!soloLectura && ev._tipo !== 'hito' && (
                  <button
                    type="button" className="publico-quitar"
                    onClick={() => (ev._tipo === 'gol' ? quitarGol(ev.id) : ev._tipo === 'tarjeta' ? quitarTarjeta(ev.id) : quitarCambio(ev.id))}
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
          {goles.length === 0 && tarjetas.length === 0 && cambios.length === 0 && <p className="admin-empty">Todavía no hay goles, tarjetas ni cambios.</p>}
        </div>
      </section>

      {!soloLectura && (
        <section className="admin-card">
          <button type="button" className="admin-btn-mal" onClick={finalizar} disabled={partido.tiempo_actual !== 'finalizado'}>Finalizar partido</button>
          {partido.tiempo_actual !== 'finalizado' && <p className="admin-empty">Termina el segundo tiempo con el cronómetro para poder finalizar el partido.</p>}
        </section>
      )}
    </>
  );
}

// Firma de un delegado de equipo (local o visitante) — mismo mecanismo que la
// firma del árbitro, pero sin observaciones (esas son solo del árbitro/anotador).
function PanelFirmaDelegado({ titulo, lado, partido, onCambio, soloLectura }) {
  const modal = useModal();
  const [firmando, setFirmando] = useState(false);
  const [nombre, setNombre] = useState('');

  const firmaUrl = lado === 'local' ? partido.firma_delegado_local : partido.firma_delegado_visitante;
  const firmante = lado === 'local' ? partido.firmante_delegado_local : partido.firmante_delegado_visitante;
  const firmadoEn = lado === 'local' ? partido.firmado_delegado_local_en : partido.firmado_delegado_visitante_en;

  async function guardarFirma(dataUrl) {
    if (!nombre.trim()) {
      await modal.error('Escribe el nombre de quien firma.', 'Falta el nombre');
      return;
    }
    setFirmando(true);
    try {
      await api(`/planilla/${partido.id}/firma-delegado`, { method: 'POST', body: JSON.stringify({ lado, firma: dataUrl, firmante_nombre: nombre }) });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar la firma');
    } finally {
      setFirmando(false);
    }
  }

  return (
    <>
      <h3>{titulo}</h3>
      {firmaUrl ? (
        <>
          <img src={firmaUrl} alt="Firma" className="planilla-firma-imagen" />
          <p className="admin-empty">Firmado por {firmante || '—'} el {new Date(firmadoEn).toLocaleString('es-CO')}</p>
        </>
      ) : soloLectura ? (
        <p className="admin-empty">Todavía no ha firmado.</p>
      ) : (
        <>
          <label className="planilla-observaciones">Nombre de quien firma
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
          </label>
          <FirmaPad onGuardar={guardarFirma} guardando={firmando} />
        </>
      )}
    </>
  );
}

function ResumenPartido({ datos, onCambio, soloLectura }) {
  const modal = useModal();
  const { partido, goles, tarjetas, cambios } = datos;
  const [firmando, setFirmando] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [firmanteNombre, setFirmanteNombre] = useState('');

  async function guardarFirma(dataUrl) {
    if (!firmanteNombre.trim()) {
      await modal.error('Escribe el nombre de quien firma.', 'Falta el nombre');
      return;
    }
    setFirmando(true);
    try {
      await api(`/planilla/${partido.id}/firma`, { method: 'POST', body: JSON.stringify({ firma: dataUrl, firmante_nombre: firmanteNombre, observaciones }) });
      await onCambio();
    } catch (err) {
      await modal.error(err.message, 'No se pudo guardar la firma');
    } finally {
      setFirmando(false);
    }
  }

  const ICONO_TARJETA = { amarilla: '🟨', roja: '🟥', azul: '🟦' };

  return (
    <section className="admin-card">
      <h2 style={{ textAlign: 'center' }}>
        {partido.equipo_local_nombre} <span style={{ fontSize: '1.6rem', fontWeight: 700 }}>{partido.goles_local} - {partido.goles_visitante}</span> {partido.equipo_visitante_nombre}
      </h2>
      {partido.penales_local != null && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>Definido por penales: {partido.penales_local}-{partido.penales_visitante}</p>
      )}
      {partido.jugado_desde && (
        <p className="admin-empty" style={{ textAlign: 'center' }}>
          {new Date(partido.jugado_desde).toLocaleDateString('es-CO', { dateStyle: 'medium' })} — de {new Date(partido.jugado_desde).toLocaleTimeString('es-CO', { timeStyle: 'short' })}
          {partido.jugado_hasta && ` a ${new Date(partido.jugado_hasta).toLocaleTimeString('es-CO', { timeStyle: 'short' })}`}
        </p>
      )}
      <h3>Goles</h3>
      <div className="admin-list">
        {goles.map((g) => (
          <div key={g.id} className="admin-item admin-item--estatico">
            <span>{g.minuto != null ? `${etiquetaMinuto(g.minuto, g.tiempo, g.minuto_adicion)} ` : ''}{g.jugador_nombre || 'Jugador'}{g.en_propia_puerta && ' (en propia puerta)'}</span>
          </div>
        ))}
        {goles.length === 0 && <p className="admin-empty">No hubo goles.</p>}
      </div>
      <h3>Tarjetas</h3>
      <div className="admin-list">
        {tarjetas.map((t) => (
          <div key={t.id} className="admin-item admin-item--estatico">
            <span>{t.minuto != null ? `${etiquetaMinuto(t.minuto, t.tiempo, t.minuto_adicion)} ` : ''}{ICONO_TARJETA[t.tipo]} {t.jugador_nombre}</span>
          </div>
        ))}
        {tarjetas.length === 0 && <p className="admin-empty">No hubo tarjetas.</p>}
      </div>
      <h3>Cambios</h3>
      <div className="admin-list">
        {cambios.map((c) => (
          <div key={c.id} className="admin-item admin-item--estatico">
            <span>{c.minuto != null ? `${etiquetaMinuto(c.minuto, c.tiempo, c.minuto_adicion)} ` : ''}🔄 Sale {c.jugador_sale_nombre} — Entra {c.jugador_entra_nombre}</span>
          </div>
        ))}
        {cambios.length === 0 && <p className="admin-empty">No hubo cambios.</p>}
      </div>

      <h3>Firma del árbitro/anotador</h3>
      {partido.firma_arbitro ? (
        <>
          <img src={partido.firma_arbitro} alt="Firma" className="planilla-firma-imagen" />
          <p className="admin-empty">Firmado por {partido.firmante_nombre || partido.firmado_por_nombre || '—'} el {new Date(partido.firmado_en).toLocaleString('es-CO')}</p>
          {partido.observaciones_arbitro && <p className="admin-empty"><strong>Observaciones:</strong> {partido.observaciones_arbitro}</p>}
          <Link to={`/arbitro/informe/${partido.id}`} target="_blank" className="subida-imagen-btn">Generar informe</Link>
        </>
      ) : soloLectura ? (
        <p className="admin-empty">Todavía no ha sido firmada por el árbitro/anotador.</p>
      ) : (
        <>
          <label className="planilla-observaciones">Nombre de quien firma
            <input type="text" value={firmanteNombre} onChange={(e) => setFirmanteNombre(e.target.value)} placeholder="Nombre completo" />
          </label>
          <label className="planilla-observaciones">Observaciones (opcional)
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} placeholder="Cualquier incidencia distinta a lo ya registrado en la planilla..." />
          </label>
          <p className="admin-empty">Firma con el dedo o el mouse para certificar lo consignado en esta planilla.</p>
          <FirmaPad onGuardar={guardarFirma} guardando={firmando} />
        </>
      )}
    </section>
  );
}
