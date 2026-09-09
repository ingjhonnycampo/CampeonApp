const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { usaSupabase } = require('../storage');

const carpeta = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(carpeta, { recursive: true });

const storage = usaSupabase()
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, carpeta),
      filename: (req, file, cb) => {
        const nombre = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase();
        cb(null, nombre);
      }
    });

const uploadDocumento = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'));
    }
    cb(null, true);
  }
});

module.exports = uploadDocumento;
