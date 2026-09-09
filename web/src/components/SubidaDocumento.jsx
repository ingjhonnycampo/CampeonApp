import { useRef, useState } from 'react';
import { subirDocumento } from '../lib/api';
import { useModal } from '../context/ModalContext';

export default function SubidaDocumento({ valor, onChange, etiqueta }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const modal = useModal();

  async function onFile(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      const url = await subirDocumento(archivo);
      onChange(url);
      await modal.exito(`"${etiqueta}" se subió correctamente.`, 'Documento subido');
    } catch (err) {
      await modal.error(err.message, 'No se pudo subir el documento');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  }

  async function quitar() {
    const ok = await modal.confirmar({
      titulo: 'Quitar el reglamento',
      mensaje: 'Los delegados ya no van a poder descargarlo desde la inscripción.',
      textoAceptar: 'Quitar',
      peligro: true
    });
    if (ok) onChange('');
  }

  return (
    <div className="subida-documento">
      <span className="subida-imagen-label">{etiqueta}</span>
      <div className="subida-documento-fila">
        {valor && (
          <a href={valor} target="_blank" rel="noreferrer" className="subida-documento-actual">
            📄 Ver el archivo actual
          </a>
        )}
        <button type="button" className="subida-imagen-btn" onClick={() => inputRef.current.click()} disabled={subiendo}>
          {subiendo ? 'Subiendo...' : valor ? 'Reemplazar PDF' : 'Subir PDF'}
        </button>
        {valor && (
          <button type="button" className="publico-quitar" onClick={quitar}>Quitar</button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onFile} />
    </div>
  );
}
