import { useEffect, useState } from 'react';
import { apiPublico, subirImagenPublica } from '../lib/api';
import { calcularEdad } from '../lib/edad';
import SubidaImagen from './SubidaImagen';

export function jugadorVacio() {
  return { nombre: '', fecha_nacimiento: '', numero_camiseta: '', cedula: '' };
}

export function calcularEstadoReglas(torneo, jugadores) {
  const fechaRef = torneo.fecha_inicio || new Date().toISOString();
  return (torneo.reglas || []).map((r) => {
    const cumplen = jugadores.filter((j) => {
      const edad = calcularEdad(j.fecha_nacimiento, fechaRef);
      return edad !== null && edad >= r.edad_minima;
    }).length;
    return { ...r, cumplen, ok: cumplen >= r.cantidad_minima };
  });
}

export default function FormularioInscripcion({
  torneo, slug, equipoIdExcluir, equipo, setEquipo, jugadores, setJugadores, onSubmit, enviando, error, textoBoton
}) {
  const [avisoDelegado, setAvisoDelegado] = useState('');
  const [avisosJugadores, setAvisosJugadores] = useState({});

  useEffect(() => {
    if (!slug || !equipo.delegado_telefono || equipo.delegado_telefono.length < 7) {
      setAvisoDelegado('');
      return;
    }
    const temporizador = setTimeout(async () => {
      try {
        const q = `telefono=${encodeURIComponent(equipo.delegado_telefono)}` + (equipoIdExcluir ? `&equipo_id=${equipoIdExcluir}` : '');
        const r = await apiPublico(`/torneos/${slug}/verificar-delegado?${q}`);
        setAvisoDelegado(r.enUso ? `Ese teléfono ya está registrado con el equipo "${r.equipo}" en este campeonato.` : '');
      } catch { /* verificación silenciosa: si falla, no bloquea el llenado del formulario */ }
    }, 500);
    return () => clearTimeout(temporizador);
  }, [equipo.delegado_telefono, slug, equipoIdExcluir]);

  useEffect(() => {
    if (!slug) return;
    const temporizadores = jugadores.map((j, i) => {
      if (!j.cedula || j.cedula.length < 5) {
        setAvisosJugadores((prev) => (prev[i] ? { ...prev, [i]: '' } : prev));
        return null;
      }
      return setTimeout(async () => {
        try {
          const q = `cedula=${encodeURIComponent(j.cedula)}` + (equipoIdExcluir ? `&equipo_id=${equipoIdExcluir}` : '');
          const r = await apiPublico(`/torneos/${slug}/verificar-cedula?${q}`);
          setAvisosJugadores((prev) => ({ ...prev, [i]: r.enUso ? `Ya está inscrito en el equipo "${r.equipo}" de este campeonato.` : '' }));
        } catch { /* verificación silenciosa */ }
      }, 500);
    });
    return () => temporizadores.forEach((t) => t && clearTimeout(t));
  }, [JSON.stringify(jugadores.map((j) => j.cedula)), slug, equipoIdExcluir]);

  function actualizarJugador(i, campo, valor) {
    setJugadores((js) => js.map((j, idx) => (idx === i ? { ...j, [campo]: valor } : j)));
  }

  function agregarJugador() {
    setJugadores((js) => [...js, jugadorVacio()]);
  }

  function quitarJugador(i) {
    setJugadores((js) => js.filter((_, idx) => idx !== i));
  }

  const reglas = calcularEstadoReglas(torneo, jugadores);
  const enElLimite = jugadores.length >= torneo.max_jugadores;

  return (
    <>
      <div className="publico-reglas">
        {reglas.map((r, i) => (
          <div key={i} className={'publico-regla' + (r.ok ? ' ok' : '')}>
            {r.descripcion || `Mínimo ${r.cantidad_minima} jugador(es) de ${r.edad_minima}+ años`}
            <span>{r.cumplen}/{r.cantidad_minima}</span>
          </div>
        ))}
        <div className={'publico-regla' + (jugadores.length >= torneo.min_jugadores ? ' ok' : '')}>
          Mínimo de jugadores en la planilla
          <span>{jugadores.length}/{torneo.min_jugadores}</span>
        </div>
        <div className="publico-regla publico-regla--info">
          Máximo de jugadores en la planilla
          <span>{jugadores.length}/{torneo.max_jugadores}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="publico-form">
        <h3>Datos del equipo</h3>
        <SubidaImagen etiqueta="Escudo del equipo" valor={equipo.escudo_url} subir={subirImagenPublica}
          onChange={(url) => setEquipo({ ...equipo, escudo_url: url })} />
        <label>Nombre del equipo
          <input value={equipo.nombre} onChange={(e) => setEquipo({ ...equipo, nombre: e.target.value })} required />
        </label>
        <div className="admin-form-row">
          <label>Delegado
            <input value={equipo.delegado} onChange={(e) => setEquipo({ ...equipo, delegado: e.target.value })} />
          </label>
          <label>Teléfono de contacto
            <input value={equipo.delegado_telefono} onChange={(e) => setEquipo({ ...equipo, delegado_telefono: e.target.value })} required />
          </label>
        </div>
        {avisoDelegado && <div className="login-error">{avisoDelegado}</div>}

        <h3>Jugadores</h3>
        {jugadores.map((j, i) => (
          <div key={i} className="publico-jugador">
            <div className="admin-form-row">
              <label>Nombre
                <input value={j.nombre} onChange={(e) => actualizarJugador(i, 'nombre', e.target.value)} required />
              </label>
              <label># de Camiseta
                <input type="number" value={j.numero_camiseta ?? ''} onChange={(e) => actualizarJugador(i, 'numero_camiseta', e.target.value)} />
              </label>
            </div>
            <div className="admin-form-row">
              <label>Fecha de nacimiento
                <input type="date" value={j.fecha_nacimiento ? j.fecha_nacimiento.slice(0, 10) : ''} onChange={(e) => actualizarJugador(i, 'fecha_nacimiento', e.target.value)} required />
              </label>
              <label>N° Documento de identidad
                <input value={j.cedula ?? ''} onChange={(e) => actualizarJugador(i, 'cedula', e.target.value)} required />
              </label>
            </div>
            {avisosJugadores[i] && <div className="login-error">{avisosJugadores[i]}</div>}
            {jugadores.length > 1 && (
              <button type="button" className="publico-quitar" onClick={() => quitarJugador(i)}>Quitar jugador</button>
            )}
          </div>
        ))}
        <button type="button" className="subida-imagen-btn" onClick={agregarJugador} disabled={enElLimite}>
          {enElLimite ? `Máximo ${torneo.max_jugadores} jugadores` : '+ Agregar otro jugador'}
        </button>

        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={enviando}>{enviando ? 'Enviando...' : textoBoton}</button>
      </form>
    </>
  );
}
