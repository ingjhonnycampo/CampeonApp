import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { api } from '../../lib/api';
import { calcularEdad, jugadorRequiereValidacion } from '../../lib/edad';
import { calcularEstadoCampeonato } from '../../lib/estadoCampeonato';
import SubidaImagen from '../../components/SubidaImagen';
import PieFirma from '../../components/PieFirma';
import EstadoCampeonato from '../../components/EstadoCampeonato';
import { nombreModalidad } from '../../lib/modalidad';

const MODALIDADES = [
  { value: 'futbol', label: 'Fútbol' },
  { value: 'futbol9', label: 'Fútbol 9' },
  { value: 'futbol7', label: 'Fútbol 7' },
  { value: 'microfutbol', label: 'Microfútbol' },
  { value: 'futbolsala', label: 'Fútbol Sala' }
];

// Qué tipos de tarjeta se configuran según la modalidad: la azul solo existe en
// microfútbol y fútbol sala, y ahí siempre es "solo el partido siguiente" (no trae
// selector de fechas, solo se le pone la multa).
const TIPOS_SANCION_POR_MODALIDAD = {
  futbol: ['amarilla', 'doble_amarilla', 'roja_directa'],
  futbol9: ['amarilla', 'doble_amarilla', 'roja_directa'],
  futbol7: ['amarilla', 'doble_amarilla', 'roja_directa'],
  microfutbol: ['amarilla', 'doble_amarilla', 'roja_directa', 'azul'],
  futbolsala: ['amarilla', 'doble_amarilla', 'roja_directa', 'azul']
};

const ETIQUETA_TIPO_SANCION = {
  amarilla: 'Amarilla',
  doble_amarilla: 'Doble amarilla (expulsión en el mismo partido)',
  roja_directa: 'Roja directa',
  azul: 'Azul'
};

const FECHAS_DEFAULT_POR_TIPO = { amarilla: 0, doble_amarilla: 1, roja_directa: 2, azul: 0 };

function reglasSancionVacias(modalidad) {
  return (TIPOS_SANCION_POR_MODALIDAD[modalidad] || []).map((tipo_sancion) => ({
    tipo_sancion, fechas_obligatorias: FECHAS_DEFAULT_POR_TIPO[tipo_sancion], multa: 0
  }));
}

export default function AdminCampeonatos() {
  const { usuario, logout } = useAuth();
  const modal = useModal();
  const [torneos, setTorneos] = useState([]);
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [reglasPlanilla, setReglasPlanilla] = useState([]);
  const [jugadoresPorEquipo, setJugadoresPorEquipo] = useState({});

  useEffect(() => { cargarTorneos(); }, []);
  useEffect(() => {
    if (torneoActivo) { cargarEquipos(torneoActivo); cargarReglas(torneoActivo); }
    else { setEquipos([]); setReglasPlanilla([]); }
  }, [torneoActivo]);

  async function cargarTorneos() {
    const data = await api('/torneos');
    setTorneos(data);
    if (!torneoActivo && data[0]) setTorneoActivo(data[0].id);
  }

  async function cargarReglas(torneoId) {
    const todas = await api(`/torneos/${torneoId}/reglas`);
    setReglasPlanilla(todas.filter((r) => r.ambito === 'planilla'));
  }

  async function cargarEquipos(torneoId) {
    const data = await api('/equipos?torneo_id=' + torneoId);
    setEquipos(data);
    const mapa = {};
    await Promise.all(data.map(async (eq) => { mapa[eq.id] = await api('/jugadores?equipo_id=' + eq.id); }));
    setJugadoresPorEquipo(mapa);
  }

  async function guardarTorneo(payload, editandoId) {
    if (editandoId) {
      await api(`/torneos/${editandoId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api('/torneos', { method: 'POST', body: JSON.stringify(payload) });
    }
    await cargarTorneos();
    await modal.exito(editandoId ? 'Los cambios del campeonato se guardaron correctamente.' : 'El campeonato se creó correctamente.');
  }

  async function aprobarEquipo(equipoId, estado, nombreEquipo) {
    const confirmado = await modal.confirmar({
      titulo: estado === 'aprobado' ? '¿Aprobar este equipo?' : '¿Rechazar este equipo?',
      mensaje: `Vas a marcar a "${nombreEquipo}" como ${estado}.`,
      textoAceptar: estado === 'aprobado' ? 'Aprobar' : 'Rechazar',
      peligro: estado === 'rechazado'
    });
    if (!confirmado) return;

    await api(`/equipos/${equipoId}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
    await cargarEquipos(torneoActivo);
    await modal.exito(`El equipo quedó ${estado}.`);
  }

  async function bajaEquipo(equipoId, tipo, nombreEquipo) {
    const motivo = await modal.preguntar({
      titulo: tipo === 'descalificado' ? `¿Descalificar a "${nombreEquipo}"?` : `¿Retirar a "${nombreEquipo}"?`,
      mensaje: 'Los partidos de liga o de grupos que todavía no se hayan jugado quedan automáticamente 3-0 a favor del rival (walkover). Si tiene partidos pendientes en la fase eliminatoria, esos no se tocan — hay que revisarlos a mano. Indica el motivo.',
      placeholder: tipo === 'descalificado' ? 'Ej: agresión al árbitro' : 'Ej: el equipo decidió retirarse del campeonato',
      textoAceptar: tipo === 'descalificado' ? 'Descalificar' : 'Retirar'
    });
    if (!motivo) return;

    try {
      const resultado = await api(`/equipos/${equipoId}/baja`, { method: 'PATCH', body: JSON.stringify({ tipo, motivo }) });
      await cargarEquipos(torneoActivo);
      let mensaje = tipo === 'descalificado' ? 'El equipo quedó descalificado.' : 'El equipo quedó retirado.';
      if (resultado.walkoversAplicados > 0) {
        mensaje += ` Se le dieron por perdidos ${resultado.walkoversAplicados} partido(s) pendiente(s) (3-0).`;
      }
      if (resultado.pendientesEliminatoria > 0) {
        mensaje += ` Tiene ${resultado.pendientesEliminatoria} partido(s) pendiente(s) en la fase eliminatoria que debes revisar a mano.`;
      }
      await modal.exito(mensaje);
    } catch (err) {
      await modal.error(err.message, 'No se pudo dar de baja al equipo');
    }
  }

  async function validarJugador(jugadorId, estado_validacion, nombreJugador) {
    const confirmado = await modal.confirmar({
      titulo: estado_validacion === 'validado' ? '¿Validar la edad de este jugador?' : '¿Rechazar la edad de este jugador?',
      mensaje: `Jugador: ${nombreJugador}.` + (estado_validacion === 'rechazado' ? ' Esto reabre la planilla del equipo para que la corrijan.' : ''),
      textoAceptar: estado_validacion === 'validado' ? 'Validar' : 'Rechazar',
      peligro: estado_validacion === 'rechazado'
    });
    if (!confirmado) return;

    await api(`/jugadores/${jugadorId}`, { method: 'PATCH', body: JSON.stringify({ estado_validacion }) });
    await cargarEquipos(torneoActivo);
    await modal.exito(estado_validacion === 'validado' ? 'Edad validada correctamente.' : 'Quedó marcada como rechazada y el equipo se reabrió.');
  }

  async function guardarJugador(jugadorId, cambios) {
    await api(`/jugadores/${jugadorId}`, { method: 'PATCH', body: JSON.stringify(cambios) });
    await cargarEquipos(torneoActivo);
    await modal.exito('Los datos del jugador se guardaron correctamente.');
  }

  async function eliminarJugador(jugadorId, nombreJugador) {
    const confirmado = await modal.confirmar({
      titulo: '¿Quitar este jugador de la planilla?',
      mensaje: `${nombreJugador} se eliminará del equipo. Esta acción no se puede deshacer.`,
      textoAceptar: 'Quitar jugador',
      peligro: true
    });
    if (!confirmado) return;

    await api(`/jugadores/${jugadorId}`, { method: 'DELETE' });
    await cargarEquipos(torneoActivo);
    await modal.exito('El jugador fue quitado de la planilla.');
  }

  async function agregarJugador(equipoId, datos) {
    await api('/jugadores', { method: 'POST', body: JSON.stringify({ ...datos, equipo_id: equipoId }) });
    await cargarEquipos(torneoActivo);
    await modal.exito('Jugador agregado a la planilla.');
  }

  async function cerrarSesion() {
    const confirmado = await modal.confirmar({
      titulo: '¿Cerrar sesión?',
      mensaje: 'Vas a salir del panel de administración.',
      textoAceptar: 'Cerrar sesión'
    });
    if (confirmado) logout();
  }

  const torneo = torneos.find((t) => t.id === torneoActivo);

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="dashboard-brand">
          <img src="/logo.png" alt="CampeonApp" className="dashboard-logo" />
          <div>
            <Link to="/admin" className="admin-volver">← Panel</Link>
            <h1>Campeonatos</h1>
          </div>
        </div>
        <div className="admin-header-right">
          <span className="admin-user">{usuario.nombre}</span>
          <button onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </header>

      <div className="admin-grid admin-grid--dos">
        <SeccionCampeonatos
          torneos={torneos}
          activo={torneoActivo}
          onSelect={setTorneoActivo}
          onGuardar={guardarTorneo}
          puedeCrear={usuario.rol === 'admin'}
        />
        <SeccionInscripciones
          torneo={torneo}
          equipos={equipos}
          jugadoresPorEquipo={jugadoresPorEquipo}
          reglasPlanilla={reglasPlanilla}
          onAprobarEquipo={aprobarEquipo}
          onBajaEquipo={bajaEquipo}
          onValidarJugador={validarJugador}
          onGuardarJugador={guardarJugador}
          onEliminarJugador={eliminarJugador}
          onAgregarJugador={agregarJugador}
        />
      </div>

      <PieFirma />
    </div>
  );
}

const SUGERIDOS_POR_MODALIDAD = {
  futbol: { min_jugadores: 15, max_jugadores: 20 },
  futbol9: { min_jugadores: 12, max_jugadores: 16 },
  futbol7: { min_jugadores: 10, max_jugadores: 14 },
  microfutbol: { min_jugadores: 7, max_jugadores: 10 },
  futbolsala: { min_jugadores: 7, max_jugadores: 10 }
};

const FORM_VACIO = {
  nombre: '', modalidad: 'futbol', duracion_tiempo_1: 45, duracion_tiempo_2: 45, logo_url: '',
  fecha_inicio: '', fecha_fin: '', inscripciones_desde: '', inscripciones_hasta: '', organizador: '', telefono_organizador: '',
  ...SUGERIDOS_POR_MODALIDAD.futbol
};

// Los campos datetime-local muestran/editan en hora LOCAL del navegador, pero la base
// de datos guarda en UTC. Hay que convertir en los dos sentidos o las fechas se corren.
function paraInput(fechaUtc) {
  if (!fechaUtc) return '';
  const d = new Date(fechaUtc);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function paraUtc(fechaLocal) {
  return fechaLocal ? new Date(fechaLocal).toISOString() : null;
}

function SeccionCampeonatos({ torneos, activo, onSelect, onGuardar, puedeCrear }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [reglas, setReglas] = useState([]);
  const [reglasSancion, setReglasSancion] = useState(() => reglasSancionVacias(FORM_VACIO.modalidad));
  const [editandoId, setEditandoId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  function agregarRegla() {
    setReglas((r) => [...r, { ambito: 'planilla', edad_minima: 40, cantidad_minima: 1, descripcion: '' }]);
  }

  function actualizarRegla(i, campo, valor) {
    setReglas((rs) => rs.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
  }

  function quitarRegla(i) {
    setReglas((rs) => rs.filter((_, idx) => idx !== i));
  }

  function actualizarReglaSancion(i, campo, valor) {
    setReglasSancion((rs) => rs.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setReglas([]);
    setReglasSancion(reglasSancionVacias(FORM_VACIO.modalidad));
    setError('');
  }

  async function editarSeleccionado() {
    const t = torneos.find((x) => x.id === activo);
    if (!t) return;
    setError('');
    setEditandoId(t.id);
    setForm({
      nombre: t.nombre, modalidad: t.modalidad, duracion_tiempo_1: t.duracion_tiempo_1, duracion_tiempo_2: t.duracion_tiempo_2,
      logo_url: t.logo_url || '', fecha_inicio: t.fecha_inicio ? t.fecha_inicio.slice(0, 10) : '',
      fecha_fin: t.fecha_fin ? t.fecha_fin.slice(0, 10) : '',
      inscripciones_desde: paraInput(t.inscripciones_desde), inscripciones_hasta: paraInput(t.inscripciones_hasta),
      max_jugadores: t.max_jugadores || 10, min_jugadores: t.min_jugadores || 7,
      organizador: t.organizador || '', telefono_organizador: t.telefono_organizador || ''
    });
    const reglasExistentes = await api(`/torneos/${t.id}/reglas`);
    setReglas(reglasExistentes);
    const tiposDeLaModalidad = TIPOS_SANCION_POR_MODALIDAD[t.modalidad] || [];
    const reglasSancionExistentes = await api(`/torneos/${t.id}/reglas-sancion`);
    setReglasSancion(reglasSancionExistentes.filter((r) => tiposDeLaModalidad.includes(r.tipo_sancion)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await onGuardar({
        ...form, reglas, reglas_sancion: reglasSancion,
        inscripciones_desde: paraUtc(form.inscripciones_desde),
        inscripciones_hasta: paraUtc(form.inscripciones_hasta)
      }, editandoId);
      cancelarEdicion();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const torneoActivo = torneos.find((t) => t.id === activo);
  const enlacePublico = torneoActivo ? `${window.location.origin}/inscripcion/${torneoActivo.slug}` : '';

  function copiarEnlace() {
    navigator.clipboard.writeText(enlacePublico);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <section className="admin-card">
      <h2>1. Campeonatos</h2>

      <div className="admin-list">
        {torneos.length === 0 && <p className="admin-empty">Todavía no hay campeonatos.</p>}
        {torneos.map((t) => (
          <button key={t.id} className={'admin-item' + (t.id === activo ? ' activo' : '')} onClick={() => onSelect(t.id)}>
            {t.logo_url ? <img src={t.logo_url} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
            <span>
              <strong>{t.nombre}</strong>
              <small>{nombreModalidad(t.modalidad)} — {t.duracion_tiempo_1}'+{t.duracion_tiempo_2}'</small>
            </span>
            <EstadoCampeonato estado={calcularEstadoCampeonato(t)} />
          </button>
        ))}
      </div>

      {torneoActivo && (
        <div className="admin-enlace">
          <span>Enlace público de inscripción</span>
          <div className="admin-enlace-row">
            <code>{enlacePublico}</code>
            <button type="button" onClick={copiarEnlace}>{copiado ? 'Copiado' : 'Copiar'}</button>
          </div>
          <div className="admin-enlace-acciones">
            {editandoId !== torneoActivo.id && (
              <button type="button" className="subida-imagen-btn" onClick={editarSeleccionado}>Editar este campeonato</button>
            )}
            <Link to={`/admin/imprimir/torneo/${torneoActivo.id}`} target="_blank" className="subida-imagen-btn">Imprimir listado de equipos</Link>
          </div>
        </div>
      )}

      {(puedeCrear || editandoId) && (
      <form onSubmit={onSubmit} className="admin-form">
        {editandoId && <p className="admin-empty">Editando "{form.nombre}" — <button type="button" className="publico-quitar" onClick={cancelarEdicion}>cancelar</button></p>}
        <SubidaImagen etiqueta="Logo del campeonato" valor={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} />
        <label>Nombre
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Liga del Barrio 2026" required />
        </label>
        <label>Modalidad
          <select value={form.modalidad} onChange={(e) => {
            const modalidad = e.target.value;
            setForm({ ...form, modalidad, ...SUGERIDOS_POR_MODALIDAD[modalidad] });
            setReglasSancion(reglasSancionVacias(modalidad));
          }}>
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <div className="admin-form-row">
          <label>Tiempo 1 (min)
            <input type="number" value={form.duracion_tiempo_1} onChange={(e) => setForm({ ...form, duracion_tiempo_1: e.target.value })} />
          </label>
          <label>Tiempo 2 (min)
            <input type="number" value={form.duracion_tiempo_2} onChange={(e) => setForm({ ...form, duracion_tiempo_2: e.target.value })} />
          </label>
        </div>
        <div className="admin-form-row">
          <label>Fecha de inicio del campeonato
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          </label>
          <label>Fecha de cierre del campeonato
            <input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
          </label>
        </div>
        <div className="admin-form-row">
          <label>Inscripciones desde
            <input type="datetime-local" value={form.inscripciones_desde} onChange={(e) => setForm({ ...form, inscripciones_desde: e.target.value })} />
          </label>
          <label>Inscripciones hasta
            <input type="datetime-local" value={form.inscripciones_hasta} onChange={(e) => setForm({ ...form, inscripciones_hasta: e.target.value })} />
          </label>
        </div>
        <div className="admin-form-row">
          <label>Mínimo de jugadores en la planilla
            <input type="number" min="1" value={form.min_jugadores} onChange={(e) => setForm({ ...form, min_jugadores: e.target.value })} />
          </label>
          <label>Máximo de jugadores en la planilla
            <input type="number" min="1" value={form.max_jugadores} onChange={(e) => setForm({ ...form, max_jugadores: e.target.value })} />
          </label>
        </div>
        <div className="admin-form-row">
          <label>Organiza
            <input value={form.organizador} onChange={(e) => setForm({ ...form, organizador: e.target.value })} placeholder="Comité de Deporte" />
          </label>
          <label>Teléfono del organizador
            <input value={form.telefono_organizador} onChange={(e) => setForm({ ...form, telefono_organizador: e.target.value })} />
          </label>
        </div>

        <div className="admin-reglas">
          <span className="subida-imagen-label">Condiciones de edad</span>
          {reglas.map((r, i) => (
            <div key={i} className="admin-regla-fila">
              <select value={r.ambito} onChange={(e) => actualizarRegla(i, 'ambito', e.target.value)}>
                <option value="planilla">En la planilla de inscripción</option>
                <option value="cancha">En cancha durante el partido</option>
              </select>
              <input type="number" value={r.cantidad_minima} onChange={(e) => actualizarRegla(i, 'cantidad_minima', e.target.value)} placeholder="Cantidad" />
              <span>de</span>
              <input type="number" value={r.edad_minima} onChange={(e) => actualizarRegla(i, 'edad_minima', e.target.value)} placeholder="Edad" />
              <span>años o más</span>
              <button type="button" className="publico-quitar" onClick={() => quitarRegla(i)}>Quitar</button>
            </div>
          ))}
          <button type="button" className="subida-imagen-btn" onClick={agregarRegla}>+ Agregar condición de edad</button>
        </div>

        <div className="admin-reglas">
          <span className="subida-imagen-label">Sanciones por tarjeta</span>
          <p className="admin-ayuda">
            Cuántas fechas de suspensión trae cada tarjeta (obligatorias, el pago no las salta) y cuánto vale la multa para habilitar al jugador.
          </p>
          {reglasSancion.map((r, i) => (
            <div key={r.tipo_sancion} className="admin-regla-sancion-fila">
              <strong>{ETIQUETA_TIPO_SANCION[r.tipo_sancion]}</strong>
              {r.tipo_sancion === 'azul' ? (
                <span className="admin-ayuda">Solo el partido siguiente</span>
              ) : (
                <select
                  value={r.fechas_obligatorias}
                  onChange={(e) => actualizarReglaSancion(i, 'fechas_obligatorias', Number(e.target.value))}
                >
                  <option value={0}>Solo el partido siguiente</option>
                  <option value={1}>1 fecha de suspensión</option>
                  <option value={2}>2 fechas de suspensión</option>
                  <option value={3}>3 fechas de suspensión</option>
                  <option value={4}>4 fechas de suspensión</option>
                  <option value={5}>5 fechas de suspensión</option>
                </select>
              )}
              <input
                type="number" min="0" placeholder="Multa ($)"
                value={r.multa}
                onChange={(e) => actualizarReglaSancion(i, 'multa', e.target.value)}
              />
            </div>
          ))}
        </div>

        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear campeonato'}
        </button>
      </form>
      )}
    </section>
  );
}

function SeccionInscripciones({
  torneo, equipos, jugadoresPorEquipo, reglasPlanilla,
  onAprobarEquipo, onBajaEquipo, onValidarJugador, onGuardarJugador, onEliminarJugador, onAgregarJugador
}) {
  const [expandido, setExpandido] = useState(null);

  if (!torneo) {
    return (
      <section className="admin-card">
        <h2>2. Inscripciones</h2>
        <p className="admin-empty">Elige o crea un campeonato primero.</p>
      </section>
    );
  }

  const fechaReferencia = torneo.fecha_inicio || new Date().toISOString();

  return (
    <section className="admin-card">
      <h2>2. Inscripciones recibidas</h2>
      <p className="admin-empty">Comparte el enlace público para que los equipos se inscriban solos. Aquí revisas y apruebas.</p>

      <div className="admin-list admin-list--alta">
        {equipos.length === 0 && <p className="admin-empty">Todavía no hay equipos inscritos.</p>}
        {equipos.map((eq) => (
          <EquipoInscrito
            key={eq.id}
            equipo={eq}
            jugadores={jugadoresPorEquipo[eq.id] || []}
            reglasPlanilla={reglasPlanilla}
            expandido={expandido === eq.id}
            onToggle={() => setExpandido(expandido === eq.id ? null : eq.id)}
            onAprobarEquipo={onAprobarEquipo}
            onBajaEquipo={onBajaEquipo}
            onValidarJugador={onValidarJugador}
            onGuardarJugador={onGuardarJugador}
            onEliminarJugador={onEliminarJugador}
            onAgregarJugador={onAgregarJugador}
            fechaReferencia={fechaReferencia}
          />
        ))}
      </div>
    </section>
  );
}

function JUGADOR_VACIO_ADMIN() {
  return { nombre: '', numero_camiseta: '', fecha_nacimiento: '', cedula: '' };
}

function FormularioEdicionJugador({ jugador, onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    nombre: jugador.nombre,
    numero_camiseta: jugador.numero_camiseta ?? '',
    fecha_nacimiento: jugador.fecha_nacimiento ? jugador.fecha_nacimiento.slice(0, 10) : '',
    cedula: jugador.cedula || ''
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar(jugador.id, form);
      onCancelar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-jugador-edicion">
      <div className="admin-form-row">
        <label>Nombre
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <label>Número
          <input type="number" value={form.numero_camiseta} onChange={(e) => setForm({ ...form, numero_camiseta: e.target.value })} />
        </label>
      </div>
      <div className="admin-form-row">
        <label>Fecha de nacimiento
          <input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
        </label>
        <label>N° Documento
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
        </label>
      </div>
      <div className="admin-equipo-acciones">
        <button type="button" className="admin-btn-ok" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="admin-btn-neutro" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function EquipoInscrito({
  equipo, jugadores, reglasPlanilla, expandido, onToggle, onAprobarEquipo, onBajaEquipo, onValidarJugador,
  onGuardarJugador, onEliminarJugador, onAgregarJugador, fechaReferencia
}) {
  const [nuevoJugador, setNuevoJugador] = useState(JUGADOR_VACIO_ADMIN());
  const [agregando, setAgregando] = useState(false);
  const [editandoJugadorId, setEditandoJugadorId] = useState(null);

  async function onAgregar(e) {
    e.preventDefault();
    setAgregando(true);
    try {
      await onAgregarJugador(equipo.id, nuevoJugador);
      setNuevoJugador(JUGADOR_VACIO_ADMIN());
    } finally {
      setAgregando(false);
    }
  }

  const jugadoresAValidar = jugadores.filter((j) => jugadorRequiereValidacion(j, reglasPlanilla, fechaReferencia));
  const edadesValidadas = jugadoresAValidar.length > 0 && jugadoresAValidar.every((j) => j.estado_validacion === 'validado');
  const habilitado = equipo.estado === 'aprobado' && edadesValidadas;

  let etiquetaEstado = equipo.estado;
  let claseEstado = equipo.estado;
  if (equipo.estado === 'aprobado') {
    etiquetaEstado = habilitado ? 'ok para participar' : 'validar edades';
    claseEstado = habilitado ? 'aprobado' : 'parcial';
  }

  return (
    <div className="admin-equipo-inscrito">
      <button type="button" className="admin-item" onClick={onToggle}>
        {equipo.escudo_url ? <img src={equipo.escudo_url} alt="" className="admin-item-logo" /> : <span className="admin-item-logo admin-item-logo--vacio" />}
        <span>
          <strong>{equipo.nombre}</strong>
          {equipo.delegado && <small>Delegado: {equipo.delegado} {equipo.delegado_telefono && `· ${equipo.delegado_telefono}`}</small>}
          {equipo.codigo_acceso && <small>Código: <span className="admin-codigo">{equipo.codigo_acceso}</span></small>}
        </span>
        <span className={'admin-estado admin-estado--' + claseEstado}>{etiquetaEstado}</span>
        {equipo.estado_torneo !== 'activo' && (
          <span className="admin-badge-baja">{equipo.estado_torneo === 'descalificado' ? 'Descalificado' : 'Retirado'}</span>
        )}
      </button>

      {expandido && (
        <div className="admin-equipo-detalle">
          {equipo.estado === 'rechazado' && equipo.motivo_rechazo && (
            <p className="publico-regla">{equipo.motivo_rechazo}</p>
          )}
          {equipo.estado === 'aprobado' && !habilitado && (
            <p className="admin-empty">Aprobado, pero faltan validar los datos de {jugadoresAValidar.filter(j => j.estado_validacion !== 'validado').length} jugador(es) mayor(es) antes de habilitar al equipo para participar.</p>
          )}
          {equipo.estado_torneo !== 'activo' && (
            <p className="admin-empty">
              {equipo.estado_torneo === 'descalificado' ? 'Descalificado' : 'Retirado'} — {equipo.baja_motivo}
              {equipo.baja_fecha && ` (${new Date(equipo.baja_fecha).toLocaleDateString('es-CO')})`}
            </p>
          )}

          <div className="admin-equipo-acciones">
            <button type="button" className="admin-btn-ok" onClick={() => onAprobarEquipo(equipo.id, 'aprobado', equipo.nombre)}>Aprobar equipo</button>
            <button type="button" className="admin-btn-mal" onClick={() => onAprobarEquipo(equipo.id, 'rechazado', equipo.nombre)}>Rechazar equipo</button>
            <Link to={`/admin/imprimir/equipo/${equipo.id}`} target="_blank" className="admin-doc-link">Imprimir planilla</Link>
            {equipo.estado_torneo === 'activo' && (
              <>
                <button type="button" className="admin-btn-mal" onClick={() => onBajaEquipo(equipo.id, 'descalificado', equipo.nombre)}>Descalificar</button>
                <button type="button" className="publico-quitar" onClick={() => onBajaEquipo(equipo.id, 'retirado', equipo.nombre)}>Retirar del torneo</button>
              </>
            )}
          </div>

          {jugadores.map((j) => {
            const edad = calcularEdad(j.fecha_nacimiento, fechaReferencia);
            const requiereValidacion = jugadorRequiereValidacion(j, reglasPlanilla, fechaReferencia);
            const editandoEste = editandoJugadorId === j.id;
            return (
              <div key={j.id} className="admin-jugador-revision">
                <div>
                  <strong>#{j.numero_camiseta ?? '-'} {j.nombre}</strong>
                  <small>N° Documento: {j.cedula || '—'} · {edad !== null ? `${edad} años` : 'Sin fecha de nacimiento'}</small>
                </div>

                {editandoEste && (
                  <FormularioEdicionJugador jugador={j} onGuardar={onGuardarJugador} onCancelar={() => setEditandoJugadorId(null)} />
                )}

                <div className="admin-equipo-acciones">
                  <button type="button" className="admin-btn-editar" onClick={() => setEditandoJugadorId(editandoEste ? null : j.id)}>
                    {editandoEste ? 'Cerrar' : 'Editar'}
                  </button>
                  {requiereValidacion ? (
                    <>
                      <span className={'admin-estado admin-estado--' + (j.estado_validacion === 'validado' ? 'aprobado' : j.estado_validacion === 'rechazado' ? 'rechazado' : 'pendiente')}>
                        {j.estado_validacion}
                      </span>
                      <button type="button" className="admin-btn-ok" onClick={() => onValidarJugador(j.id, 'validado', j.nombre)}>Validar</button>
                      <button type="button" className="admin-btn-mal" onClick={() => onValidarJugador(j.id, 'rechazado', j.nombre)}>Rechazar</button>
                    </>
                  ) : (
                    <span className="admin-empty admin-empty--flex">No requiere validación de edad</span>
                  )}
                  <button type="button" className="admin-btn-mal" onClick={() => onEliminarJugador(j.id, j.nombre)}>Quitar</button>
                </div>
              </div>
            );
          })}

          <form onSubmit={onAgregar} className="admin-jugador-nuevo">
            <span className="subida-imagen-label">Agregar jugador (refuerzo)</span>
            <div className="admin-form-row">
              <label>Nombre
                <input value={nuevoJugador.nombre} onChange={(e) => setNuevoJugador({ ...nuevoJugador, nombre: e.target.value })} required />
              </label>
              <label>Número
                <input type="number" value={nuevoJugador.numero_camiseta} onChange={(e) => setNuevoJugador({ ...nuevoJugador, numero_camiseta: e.target.value })} />
              </label>
            </div>
            <div className="admin-form-row">
              <label>Fecha de nacimiento
                <input type="date" value={nuevoJugador.fecha_nacimiento} onChange={(e) => setNuevoJugador({ ...nuevoJugador, fecha_nacimiento: e.target.value })} required />
              </label>
              <label>N° Documento
                <input value={nuevoJugador.cedula} onChange={(e) => setNuevoJugador({ ...nuevoJugador, cedula: e.target.value })} required />
              </label>
            </div>
            <button type="submit" disabled={agregando}>{agregando ? 'Agregando...' : '+ Agregar a la planilla'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
