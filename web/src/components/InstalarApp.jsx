import { useEffect, useState } from 'react';

function yaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function esIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Banner elegante para instalar la app como PWA. En Android/desktop (Chrome,
// Edge) usa el evento nativo del navegador para instalar con un clic. iOS Safari
// no tiene ese evento — ahí no hay forma de disparar la instalación por código,
// así que se muestran los pasos manuales (agregar a inicio desde "Compartir").
export default function InstalarApp() {
  const [eventoInstalacion, setEventoInstalacion] = useState(null);
  const [mostrarPasosIOS, setMostrarPasosIOS] = useState(false);
  const [oculto, setOculto] = useState(true);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (yaInstalada() || localStorage.getItem('instalarapp_oculto') === '1') return;

    function alDetectarPrompt(e) {
      e.preventDefault();
      setEventoInstalacion(e);
      setOculto(false);
    }
    window.addEventListener('beforeinstallprompt', alDetectarPrompt);

    if (esIOS()) {
      setMostrarPasosIOS(true);
      setOculto(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', alDetectarPrompt);
  }, []);

  function cerrar() {
    localStorage.setItem('instalarapp_oculto', '1');
    setOculto(true);
  }

  async function instalar() {
    if (!eventoInstalacion) return;
    setInstalando(true);
    eventoInstalacion.prompt();
    const { outcome } = await eventoInstalacion.userChoice;
    setInstalando(false);
    if (outcome === 'accepted') setOculto(true);
    setEventoInstalacion(null);
  }

  if (oculto) return null;

  return (
    <div className="instalarapp-banner">
      <img src="/icon-192.png" alt="" className="instalarapp-icono" />
      <div className="instalarapp-texto">
        <strong>Instala CampeonApp</strong>
        {mostrarPasosIOS ? (
          <p>Toca <span className="instalarapp-icono-compartir">⬆️</span> Compartir y luego "Agregar a inicio" para tenerla como app.</p>
        ) : (
          <p>Ábrela como una app, directo desde tu pantalla de inicio.</p>
        )}
      </div>
      <div className="instalarapp-acciones">
        {!mostrarPasosIOS && (
          <button type="button" className="instalarapp-btn-instalar" onClick={instalar} disabled={instalando}>
            {instalando ? 'Instalando...' : 'Instalar'}
          </button>
        )}
        <button type="button" className="instalarapp-btn-cerrar" onClick={cerrar} aria-label="Cerrar">✕</button>
      </div>
    </div>
  );
}
