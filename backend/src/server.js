// backend/src/server.js
require('dotenv').config();

// ============================================================
// 1. VALIDACIÓN DE VARIABLES DE ENTORNO CRÍTICAS
// ============================================================
const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
const recommendedVars = ['GESVISION_URL', 'GESVISION_USER', 'GESVISION_PASS'];

const missing = requiredVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Faltan variables de entorno críticas: ${missing.join(', ')}`);
  process.exit(1);
}

const missingRecommended = recommendedVars.filter((v) => !process.env[v]);
if (missingRecommended.length > 0) {
  console.warn(`⚠️ Variables recomendadas no configuradas: ${missingRecommended.join(', ')}`);
}

// ============================================================
// 2. IMPORTACIONES
// ============================================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const logger = require('./config/logger');

// Rutas
const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const labRoutes = require('./routes/labRoutes');
const adminRoutes = require('./routes/adminRoutes');

// La generación y entrega del VCA es nativa del backend: se escribe con fs
// en services/vcaService.js (cron vcaDeliveryCron). Ya no hay agente de polling.

// Rutas de firma digital QZ Tray
const qzRoutes = require('./routes/qzRoutes');

// Catálogo de categorías de garantía (órigen del defecto: TIENDA/LABORATORIO)
const categoryRoutes = require('./routes/categoryRoutes');

// Credenciales de firma QZ Tray: se cargan al arrancar para que el aviso de
// "faltan credenciales" salga una sola vez. Sin par clave/certificado los
// endpoints /api/qz/* responden 503 y QZ Tray aborta la impresión (no vuelve
// a mostrar sus diálogos de confirmación).
const { loadKeys } = require('./config/qzKeys');

// Cron Jobs
const { startOrphanCleanupCron } = require('./cron/orphanCleanup');
const { startVcaDeliveryCron } = require('./cron/vcaDeliveryCron');

// 3. INICIALIZAR EXPRESS
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.set('trust proxy', 1);

// ✅ MIDDLEWARES GLOBALES
// Helmet con CSP desactivada: la SPA se sirve desde el mismo backend y QZ Tray
// se comunica por WebSocket local; una CSP estricta rompería ambos flujos.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS con lista blanca flexible (ver config/cors.js: FRONTEND_URL canónico más
// los alias CORS_ORIGIN / CORS_ORIGINS / ALLOWED_ORIGINS, varios por coma). Se
// permite el mismo origen que el Host y, fuera de producción, cualquier localhost
// o IP de red privada. Sin whitelist configurada se mantiene el modo permisivo.
const { resolveAllowedOrigins, isOriginAllowed } = require('./config/cors');
const { allowedOrigins, source: corsSource } = resolveAllowedOrigins();

if (corsSource) {
  logger.info(`[CORS] Whitelist activa desde ${corsSource}: ${allowedOrigins.join(', ')}`);
} else {
  logger.info('[CORS] Sin whitelist configurada; CORS abierto.');
}
if (NODE_ENV !== 'production') {
  logger.info('[CORS] Modo no-productivo: se permiten orígenes localhost y de red privada.');
}

// Validación explícita: responde 403 limpio en lugar de 500. Antes el Error lanzado
// dentro de cors caía en el middleware global de errores y se traducía a 500.
app.use((req, res, next) => {
  if (isOriginAllowed(req.headers.origin, { allowedOrigins, requestHost: req.headers.host, nodeEnv: NODE_ENV })) {
    return next();
  }
  logger.warn(`[CORS] Origen bloqueado: ${req.headers.origin} (Host: ${req.headers.host})`);
  return res.status(403).json({ error: 'Origen no permitido por CORS' });
});

// Ya validado arriba: cors refleja el origen y resuelve el preflight OPTIONS.
app.use(cors({ origin: true }));

// Rate limit solo para el login (fuerza bruta de credenciales)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
});
app.use('/api/auth/login', loginLimiter);

// 5. REGISTRAR RUTAS DE API
app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/admin', adminRoutes);

// Firma digital QZ Tray: el frontend pide certificado y firmas para imprimir sin diálogos.
// (El VCA se entrega localmente con fs en services/vcaService.js; ya no hay agente externo.)
app.use('/api/qz', qzRoutes);

// Catálogo de categorías de garantía (tienda formulario + filtros lab/admin)
app.use('/api/warranty-categories', categoryRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', service: 'SGG Backend', uptime: process.uptime() });
});

// ======================================================
// 6. Servir el frontend (React/Vite) y Fallback SPA
// ======================================================
const frontendDistPath = path.join(__dirname, '../../frontend/dist');

app.use(express.static(frontendDistPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// ✅ MIDDLEWARE DE ERRORES (debe ir al final, después de todas las rutas)
// No se filtra err.message al cliente: el detalle queda solo en el log.
app.use((err, req, res, next) => {
  logger.error(`[Route Error] ${err.message}`, { stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Internal Server Error' });
});

// ======================================================
// 7. INICIAR CRON JOBS
// ======================================================
startOrphanCleanupCron();

// 7.c Entrega local del VCA (fs + cron)
startVcaDeliveryCron();

// 7.b Cargar credenciales de firma QZ Tray (avisa al arrancar si faltan)
loadKeys();

// 8. INICIAR EL SERVIDOR
const server = app.listen(PORT, () => {
  logger.info(`🚀 Servidor corriendo en el puerto ${PORT}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

// ============================================================
// 13. GRACEFUL SHUTDOWN
// ============================================================
const shutdown = (signal) => {
  logger.info(`📴 ${signal} recibido. Iniciando cierre elegante...`);
  if (server) {
    server.close(() => {
      logger.info('🔒 Servidor HTTP cerrado.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  setTimeout(() => {
    logger.error('⚠️ Cierre forzado tras 10 segundos.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================
// 14. ERRORES NO CAPTURADOS
// ============================================================
process.on('unhandledRejection', (reason) => {
  logger.error(`[unhandledRejection] ${reason}`, { stack: reason?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error(`[uncaughtException] ${err.message}`, { stack: err.stack });
  shutdown('uncaughtException');
});