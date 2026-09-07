import { useState } from 'react';

// Maneja qué fila de partido está abierta (tipo acordeón: abrir una cierra la
// anterior) y cuáles quedaron "fijadas" — esas se quedan abiertas aunque se abra
// otra, hasta que se desfijen.
export function useFilasAbiertas() {
  const [abiertoId, setAbiertoId] = useState(null);
  const [fijados, setFijados] = useState(() => new Set());

  function alternarAbierto(id) {
    setAbiertoId((actual) => (actual === id ? null : id));
  }

  function alternarFijado(id) {
    setFijados((actuales) => {
      const copia = new Set(actuales);
      if (copia.has(id)) copia.delete(id); else copia.add(id);
      return copia;
    });
  }

  function estaAbierto(id) {
    return fijados.has(id) || abiertoId === id;
  }

  return { estaAbierto, alternarAbierto, alternarFijado, estaFijado: (id) => fijados.has(id) };
}
