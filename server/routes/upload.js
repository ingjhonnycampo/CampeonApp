const express = require('express');
const upload = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');
const { subirImagen, usaSupabase } = require('../storage');

const router = express.Router();

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  upload.single('imagen')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    try {
      if (usaSupabase()) {
        const url = await subirImagen(req.file.buffer, req.file.originalname, req.file.mimetype);
        return res.status(201).json({ url });
      }
      res.status(201).json({ url: '/uploads/' + req.file.filename });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

module.exports = router;
