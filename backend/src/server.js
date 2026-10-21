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
const logger = require('./config/logger');
const { createApp } = require('./app');
const container = require('./container');
const { loadKeys } = require('./config/qzKeys');
const { startOrphanCleanupCron } = require('./cron/orphanCleanup');
const { startVcaDeliveryCron, stopVcaDeliveryCron } = require('./cron/vcaDeliveryCron');

const app = createApp();
const PORT = process.env.PORT || 3000;

// ============================================================
// 3. CRON JOBS
// ============================================================
startOrphanCleanupCron();
startVcaDeliveryCron(container.vcaOutboxWorker);

// Credenciales de firma QZ Tray (avisa al arrancar si faltan).
loadKeys();

// ============================================================
// 4. INICIAR EL SERVIDOR
// ============================================================
const server = app.listen(PORT, () => {
  logger.info(`🚀 Servidor corriendo en el puerto ${PORT}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

// ============================================================
// 5. GRACEFUL SHUTDOWN
// ============================================================
const shutdown = (signal) => {
  logger.info(`📴 ${signal} recibido. Iniciando cierre elegante...`);
  stopVcaDeliveryCron();
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
// 6. ERRORES NO CAPTURADOS
// ============================================================
process.on('unhandledRejection', (reason) => {
  logger.error(`[unhandledRejection] ${reason}`, { stack: reason?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error(`[uncaughtException] ${err.message}`, { stack: err.stack });
  shutdown('uncaughtException');
});
