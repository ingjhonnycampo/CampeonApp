import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

// Ajustes globales de la plataforma (hoy solo la transmisión en vivo), guardados
// en la base de datos — se cargan una sola vez acá y se comparten con toda la
// app, en vez de que cada componente que los necesita haga su propia consulta.
const ConfiguracionContext = createContext({ transmisionHabilitada: false, plataformaDisponible: true, cargando: true });

export function ConfiguracionProvider({ children }) {
  const [configuracion, setConfiguracion] = useState({ transmisionHabilitada: false, plataformaDisponible: true, cargando: true });

  async function cargar() {
    try {
      const data = await api('/configuracion');
      setConfiguracion({ transmisionHabilitada: data.transmisionHabilitada, plataformaDisponible: data.plataformaDisponible !== false, cargando: false });
    } catch {
      setConfiguracion((previa) => ({ ...previa, cargando: false }));
    }
  }

  // Se vuelve a consultar cada tanto para que quien ya tiene la app abierta se
  // entere solo cuando el admin apaga o enciende la plataforma.
  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <ConfiguracionContext.Provider value={{ ...configuracion, refrescar: cargar }}>
      {children}
    </ConfiguracionContext.Provider>
  );
}

export function useConfiguracion() {
  return useContext(ConfiguracionContext);
}
