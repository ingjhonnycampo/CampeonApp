// Sube imágenes a Supabase Storage en vez de al disco local del servidor — el
// disco de casi cualquier hosting de producción es efímero (se borra en cada
// reinicio/despliegue), así que las fotos/logos se perderían si se quedaran ahí.
//
// Si todavía no se configuró SUPABASE_SERVICE_KEY (por ejemplo, en desarrollo
// local sin querer tocar el bucket real), cae solo a guardar en disco como antes
// — así nada se rompe mientras se termina de configurar.
const crypto = require('crypto');
const path = require('path');

const BUCKET = process.env.SUPABASE_BUCKET || 'media';

// El proyecto de Supabase se puede derivar de la misma DATABASE_URL que ya se usa
// para Postgres (postgres.<project-ref>@...) — así no hay que repetir la URL en
// otra variable de entorno aparte, salvo que se quiera apuntar a otro proyecto.
function urlProyectoDesdeDatabaseUrl() {
  const m = (process.env.DATABASE_URL || '').match(/postgres\.([a-z0-9]+):/);
  return m ? `https://${m[1]}.supabase.co` : null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || urlProyectoDesdeDatabaseUrl();
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let cliente = null;
function obtenerCliente() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  if (!cliente) {
    const { createClient } = require('@supabase/supabase-js');
    cliente = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return cliente;
}

function usaSupabase() {
  return !!obtenerCliente();
}

// Sube el buffer de una imagen ya validada (tipo/tamaño) por multer y devuelve la
// URL pública para guardar en la base de datos.
async function subirImagen(buffer, nombreOriginal, mimetype) {
  const nombre = crypto.randomBytes(16).toString('hex') + path.extname(nombreOriginal).toLowerCase();
  const supabase = obtenerCliente();

  const { error } = await supabase.storage.from(BUCKET).upload(nombre, buffer, { contentType: mimetype });
  if (error) throw new Error('No se pudo subir la imagen: ' + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombre);
  return data.publicUrl;
}

module.exports = { subirImagen, usaSupabase };
