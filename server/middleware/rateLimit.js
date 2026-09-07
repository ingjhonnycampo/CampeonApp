const rateLimit = require('express-rate-limit');

// En las pruebas automatizadas todo corre desde la misma IP local y varios
// archivos de test hacen login/inscripciones repetidamente — sin este "skip"
// terminarían chocando entre sí con 429 según cuántos se acumulen.
const skip = () => process.env.NODE_ENV === 'test';

// Intentos de login: protege contra fuerza bruta de contraseña. Por IP+email
// hubiera sido más preciso, pero por IP sola ya cubre el caso real (un atacante
// probando muchas contraseñas contra la misma cuenta desde la misma máquina).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentar.' }
});

// Crear una inscripción pública: evita que un script mande cientos de equipos
// falsos a un formulario público en minutos.
const inscripcionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Demasiadas inscripciones enviadas desde este lugar. Espera un momento y vuelve a intentar.' }
});

// Editar una inscripción por su código de acceso (7 caracteres): es lo más
// sensible a fuerza bruta de todo lo público, porque el código en sí ES la
// contraseña — sin este límite, alguien podría intentar barrer combinaciones.
const codigoAccesoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Demasiados intentos con ese código de acceso. Espera unos minutos y vuelve a intentar.' }
});

// Subida de imágenes pública (escudo del equipo al inscribirse): límite más
// amplio, solo para frenar abuso/costos de almacenamiento, no fuerza bruta.
const uploadPublicoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Demasiadas imágenes subidas desde este lugar. Espera un momento y vuelve a intentar.' }
});

module.exports = { loginLimiter, inscripcionLimiter, codigoAccesoLimiter, uploadPublicoLimiter };
