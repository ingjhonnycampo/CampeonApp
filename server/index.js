require('dotenv').config();
const path = require('path');
const Sentry = require('@sentry/node');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

// Monitoreo de errores: solo se activa si hay un DSN configurado (queda mudo en
// desarrollo local mientras no se configure). Se inicializa antes que cualquier
// otra cosa para poder capturar errores lo antes posible.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1
  });
}

const authRouter = require('./routes/auth');
const torneosRouter = require('./routes/torneos');
const equiposRouter = require('./routes/equipos');
const jugadoresRouter = require('./routes/jugadores');
const uploadRouter = require('./routes/upload');
const publicoRouter = require('./routes/publico');
const usuariosRouter = require('./routes/usuarios');
const partidosRouter = require('./routes/partidos');
const fasesRouter = require('./routes/fases');
const bitacoraRouter = require('./routes/bitacora');
const planillaRouter = require('./routes/planilla');
const sancionesRouter = require('./routes/sanciones');
const configuracionRouter = require('./routes/configuracion');
const estadisticasUsoRouter = require('./routes/estadisticasUso');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Necesario detrás de un proxy (Render, etc.) para que req.ip sea la IP real del
// visitante y no la del proxy — de lo que depende el rate limiting de abajo.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' })); // 2mb: la firma del arbitro va como PNG en base64 dentro del body
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/salud', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/torneos', torneosRouter);
app.use('/api/equipos', equiposRouter);
app.use('/api/jugadores', jugadoresRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/publico', publicoRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/partidos', partidosRouter);
app.use('/api/fases', fasesRouter);
app.use('/api/bitacora', bitacoraRouter);
app.use('/api/planilla', planillaRouter);
app.use('/api/sanciones', sancionesRouter);
app.use('/api/configuracion', configuracionRouter);
app.use('/api/estadisticas-uso', estadisticasUsoRouter);

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
});

if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

// Al correr "node server/index.js" (dev/producción) sí arranca a escuchar en el
// puerto configurado. Si en cambio este archivo se importa (los tests hacen
// require('../index') para levantar su propia instancia en un puerto libre),
// NO se pone a escuchar solo — evita pisar al servidor de verdad que ya está
// corriendo en ese mismo puerto.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = { app, server };
