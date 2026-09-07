import { useRef, useState } from 'react';

// Pizarra de firma: funciona con mouse o con el dedo (touch). Devuelve la firma
// como PNG en base64 (data URL) via onGuardar.
export default function FirmaPad({ onGuardar, guardando }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  function posicion(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return {
      x: (punto.clientX - rect.left) * (canvas.width / rect.width),
      y: (punto.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function empezar(e) {
    e.preventDefault();
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(e) {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = posicion(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#142138';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setTieneTrazo(true);
  }

  function terminar() {
    dibujando.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
  }

  function guardar() {
    if (!tieneTrazo) return;
    onGuardar(canvasRef.current.toDataURL('image/png'));
  }

  return (
    <div className="firma-pad">
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        className="firma-pad-lienzo"
        onMouseDown={empezar}
        onMouseMove={mover}
        onMouseUp={terminar}
        onMouseLeave={terminar}
        onTouchStart={empezar}
        onTouchMove={mover}
        onTouchEnd={terminar}
      />
      <div className="firma-pad-botones">
        <button type="button" className="subida-imagen-btn" onClick={limpiar}>Borrar</button>
        <button type="button" className="admin-btn-ok" onClick={guardar} disabled={!tieneTrazo || guardando}>
          {guardando ? 'Guardando...' : 'Guardar firma'}
        </button>
      </div>
    </div>
  );
}
