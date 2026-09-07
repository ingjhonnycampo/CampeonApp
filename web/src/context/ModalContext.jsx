import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolverRef = useRef(null);

  const cerrar = useCallback((resultado) => {
    setModal(null);
    if (resolverRef.current) {
      resolverRef.current(resultado);
      resolverRef.current = null;
    }
  }, []);

  const confirmar = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        tipo: 'confirmar',
        titulo: opciones.titulo || '¿Confirmas esta acción?',
        mensaje: opciones.mensaje || '',
        textoAceptar: opciones.textoAceptar || 'Confirmar',
        textoCancelar: opciones.textoCancelar || 'Cancelar',
        peligro: !!opciones.peligro
      });
    });
  }, []);

  const exito = useCallback((mensaje, titulo = '¡Listo!') => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({ tipo: 'exito', titulo, mensaje });
    });
  }, []);

  const error = useCallback((mensaje, titulo = 'Algo no salió bien') => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({ tipo: 'error', titulo, mensaje });
    });
  }, []);

  const elegir = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        tipo: 'elegir',
        titulo: opciones.titulo || 'Elige una opción',
        mensaje: opciones.mensaje || '',
        opciones: opciones.opciones || []
      });
    });
  }, []);

  const penales = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        tipo: 'penales',
        titulo: opciones.titulo || 'Definición por penales',
        mensaje: opciones.mensaje || '',
        equipoLocal: opciones.equipoLocal,
        equipoVisitante: opciones.equipoVisitante,
        penalesLocal: '',
        penalesVisitante: ''
      });
    });
  }, []);

  // Pide el motivo (obligatorio) y la multa económica para el equipo (puede ser 0)
  // de una expulsión de jugador del campeonato — una falta disciplinaria grave
  // donde una tarjeta no alcanza como sanción.
  const expulsarJugador = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        tipo: 'expulsarJugador',
        titulo: opciones.titulo || 'Expulsar jugador del campeonato',
        mensaje: opciones.mensaje || '',
        motivo: '',
        multa: '0'
      });
    });
  }, []);

  const preguntar = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        tipo: 'preguntar',
        titulo: opciones.titulo || 'Escribe una respuesta',
        mensaje: opciones.mensaje || '',
        placeholder: opciones.placeholder || '',
        textoAceptar: opciones.textoAceptar || 'Aceptar',
        valor: ''
      });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ confirmar, exito, error, elegir, preguntar, penales, expulsarJugador }}>
      {children}
      {modal && (
        <div className="modal-fondo" onClick={() => (modal.tipo === 'confirmar' && cerrar(false)) || ((modal.tipo === 'elegir' || modal.tipo === 'preguntar' || modal.tipo === 'penales') && cerrar(null))}>
          <div className={'modal-caja modal-caja--' + modal.tipo} onClick={(e) => e.stopPropagation()}>
            <div className={'modal-icono modal-icono--' + modal.tipo}>
              {modal.tipo === 'exito' && '✓'}
              {modal.tipo === 'error' && '!'}
              {(modal.tipo === 'confirmar' || modal.tipo === 'elegir' || modal.tipo === 'preguntar' || modal.tipo === 'penales' || modal.tipo === 'expulsarJugador') && '?'}
            </div>
            <h3>{modal.titulo}</h3>
            {modal.mensaje && <p>{modal.mensaje}</p>}
            {modal.tipo === 'expulsarJugador' ? (
              <>
                <textarea
                  className="modal-textarea"
                  placeholder="Motivo de la expulsión (ej: agresión al árbitro)"
                  value={modal.motivo}
                  onChange={(e) => setModal({ ...modal, motivo: e.target.value })}
                  autoFocus
                  rows={3}
                />
                <label className="modal-campo-multa">
                  Multa para el equipo (el equipo no podrá jugar hasta que se pague)
                  <input
                    type="number" min="0"
                    value={modal.multa}
                    onChange={(e) => setModal({ ...modal, multa: e.target.value })}
                  />
                </label>
                <div className="modal-acciones">
                  <button className="modal-btn-secundario" onClick={() => cerrar(null)}>Cancelar</button>
                  <button
                    className="modal-btn-peligro"
                    disabled={!modal.motivo.trim()}
                    onClick={() => cerrar({ motivo: modal.motivo.trim(), multa: Number(modal.multa) || 0 })}
                  >
                    Expulsar del campeonato
                  </button>
                </div>
              </>
            ) : modal.tipo === 'penales' ? (
              <>
                <div className="modal-penales-fila">
                  <label>
                    {modal.equipoLocal}
                    <input
                      type="number" min="0" autoFocus
                      value={modal.penalesLocal}
                      onChange={(e) => setModal({ ...modal, penalesLocal: e.target.value })}
                    />
                  </label>
                  <span className="modal-penales-guion">-</span>
                  <label>
                    {modal.equipoVisitante}
                    <input
                      type="number" min="0"
                      value={modal.penalesVisitante}
                      onChange={(e) => setModal({ ...modal, penalesVisitante: e.target.value })}
                    />
                  </label>
                </div>
                <div className="modal-acciones">
                  <button className="modal-btn-secundario" onClick={() => cerrar(null)}>Cancelar</button>
                  <button
                    className="modal-btn-principal"
                    disabled={
                      modal.penalesLocal === '' || modal.penalesVisitante === '' ||
                      Number(modal.penalesLocal) === Number(modal.penalesVisitante)
                    }
                    onClick={() => cerrar({ local: Number(modal.penalesLocal), visitante: Number(modal.penalesVisitante) })}
                  >
                    Guardar penales
                  </button>
                </div>
              </>
            ) : modal.tipo === 'elegir' ? (
              <div className="modal-acciones modal-acciones--columna">
                {modal.opciones.map((op) => (
                  <button key={op.valor} className="modal-btn-principal" onClick={() => cerrar(op.valor)}>{op.texto}</button>
                ))}
                <button className="modal-btn-secundario" onClick={() => cerrar(null)}>Cancelar</button>
              </div>
            ) : modal.tipo === 'preguntar' ? (
              <>
                <textarea
                  className="modal-textarea"
                  placeholder={modal.placeholder}
                  value={modal.valor}
                  onChange={(e) => setModal({ ...modal, valor: e.target.value })}
                  autoFocus
                  rows={3}
                />
                <div className="modal-acciones">
                  <button className="modal-btn-secundario" onClick={() => cerrar(null)}>Cancelar</button>
                  <button
                    className="modal-btn-principal"
                    onClick={() => cerrar(modal.valor.trim())}
                    disabled={!modal.valor.trim()}
                  >
                    {modal.textoAceptar}
                  </button>
                </div>
              </>
            ) : (
              <div className="modal-acciones">
                {modal.tipo === 'confirmar' && (
                  <button className="modal-btn-secundario" onClick={() => cerrar(false)}>{modal.textoCancelar}</button>
                )}
                <button
                  className={modal.tipo === 'confirmar' && modal.peligro ? 'modal-btn-peligro' : 'modal-btn-principal'}
                  onClick={() => cerrar(true)}
                  autoFocus
                >
                  {modal.tipo === 'confirmar' ? modal.textoAceptar : 'Aceptar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
