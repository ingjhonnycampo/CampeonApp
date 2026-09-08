import { apiPublico } from './api';

// Dispara el registro de una visita sin bloquear ni afectar la pantalla — si
// falla (red lenta, lo que sea), no pasa nada, simplemente no queda contada.
export function registrarVisita(ruta, torneoId) {
  apiPublico('/visita', {
    method: 'POST',
    body: JSON.stringify({ ruta, torneo_id: torneoId || null })
  }).catch(() => {});
}
