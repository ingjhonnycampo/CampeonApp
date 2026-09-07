import { useEffect, useState } from 'react';

// Ejecuta cargarFn() y no muestra el resultado hasta que pasen al menos minMs,
// para que la animación de carga (el jugador haciendo pinolitas) se alcance a ver bien.
export function useCargaMinima(cargarFn, deps, minMs = 3000) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setDatos(null);
    const inicio = Date.now();

    cargarFn().then((resultado) => {
      const espera = Math.max(0, minMs - (Date.now() - inicio));
      setTimeout(() => {
        if (!cancelado) {
          setDatos(resultado);
          setCargando(false);
        }
      }, espera);
    });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { datos, cargando };
}
