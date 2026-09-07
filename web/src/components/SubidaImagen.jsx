import { useRef, useState } from 'react';
import { subirImagen } from '../lib/api';
import { useModal } from '../context/ModalContext';

export default function SubidaImagen({ valor, onChange, etiqueta, subir = subirImagen }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const modal = useModal();

  async function onFile(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setSubiendo(true);
    try {
      const url = await subir(archivo);
      onChange(url);
      await modal.exito(`"${etiqueta}" se subió correctamente.`, 'Imagen subida');
    } catch (err) {
      await modal.error(err.message, 'No se pudo subir la imagen');
    } finally {
      setSubiendo(false);
      e.target.value = '';
    }
  }

  return (
    <div className="subida-imagen">
      <button type="button" className="subida-imagen-preview" onClick={() => inputRef.current.click()}>
        {valor ? <img src={valor} alt={etiqueta} /> : <span>+</span>}
      </button>
      <div>
        <span className="subida-imagen-label">{etiqueta}</span>
        <button type="button" className="subida-imagen-btn" onClick={() => inputRef.current.click()} disabled={subiendo}>
          {subiendo ? 'Subiendo...' : valor ? 'Cambiar imagen' : 'Subir imagen'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={onFile} />
    </div>
  );
}
