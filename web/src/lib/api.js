// En desarrollo el proxy de Vite reenvía /api al backend local (mismo origen,
// así que puede quedar vacío). En producción, si el frontend y el backend viven
// en dominios distintos (ej. Vercel + Render), VITE_API_URL apunta al backend
// (ej. https://campeonapp-api.onrender.com) — sin esto, las peticiones irían al
// propio dominio del frontend, que no tiene esas rutas.
const BASE = import.meta.env.VITE_API_URL || '';

// Rutas donde un 401 es parte normal del flujo (login que rechaza credenciales
// malas, o el chequeo de sesión al abrir la app) — ahí NO hay que redirigir,
// cada una ya maneja su propio caso.
const RUTAS_401_ESPERADO = ['/auth/login', '/auth/yo'];

export async function api(path, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });

  // Cualquier otra ruta protegida que responda 401 significa que la sesión ya
  // no es válida (expiró, o se cerró en otra pestaña) — en vez de dejar que el
  // error se propague sin control por toda la pantalla, mandamos derecho al
  // login. La promesa nunca se resuelve a propósito: ya estamos navegando
  // fuera, no tiene sentido que el código que llamó siga corriendo con datos
  // que nunca van a llegar.
  if (res.status === 401 && !RUTAS_401_ESPERADO.includes(path)) {
    window.location.href = '/login?sesion=expirada';
    return new Promise(() => {});
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

export async function apiPublico(path, opts = {}) {
  const res = await fetch(BASE + '/api/publico' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

async function subirA(endpoint, archivo, opts = {}) {
  const formData = new FormData();
  formData.append('imagen', archivo);
  const res = await fetch(BASE + endpoint, { method: 'POST', body: formData, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
  return data.url;
}

export const subirImagen = (archivo) => subirA('/api/upload', archivo, { credentials: 'include' });
export const subirImagenPublica = (archivo) => subirA('/api/publico/upload', archivo);
