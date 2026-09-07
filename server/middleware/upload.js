const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { usaSupabase } = require('../storage');

const carpeta = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(carpeta, { recursive: true });

// Si Supabase Storage está configurado, se recibe el archivo en memoria (para
// subirlo desde ahí) — si no, se guarda en disco local como antes, para que el
// desarrollo local siga funcionando sin necesitar credenciales de Supabase.
const storage = usaSupabase()
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, carpeta),
      filename: (req, file, cb) => {
        const nombre = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase();
        cb(null, nombre);
      }
    });

const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido (usar PNG, JPG, WEBP o SVG)'));
    }
    cb(null, true);
  }
});

module.exports = upload;
