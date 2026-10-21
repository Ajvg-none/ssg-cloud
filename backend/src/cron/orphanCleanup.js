// backend/src/cron/orphanCleanup.js
const cron = require('node-cron');
const logger = require('../config/logger');
const { repositories } = require('../container');

/**
 * Resetea garantías PROCESSING con más de 5 minutos a PENDING (RF-04.2).
 */
const cleanupOrphanWarranties = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    logger.info('[orphanCleanup] Iniciando limpieza de garantías huérfanas...', {
      threshold: fiveMinutesAgo.toISOString(),
    });

    const { count, orphans } = await repositories.warrantyRepo.cleanupOrphans(fiveMinutesAgo);

    if (count === 0) {
      logger.info('[orphanCleanup] No hay garantías huérfanas.');
      return;
    }

    logger.warn(`[orphanCleanup] ${count} garantía(s) reseteada(s) a PENDING`);
    orphans.forEach((w) => {
      logger.warn('[orphanCleanup] Garantía huérfana reseteada', {
        warrantyId: w.id,
        orderNumber: w.orderNumber,
        labId: w.labId,
        processingStartedAt: w.processingStartedAt,
      });
    });
  } catch (error) {
    logger.error(`[orphanCleanup] Error: ${error.message}`);
  }
};

const startOrphanCleanupCron = () => {
  cron.schedule('*/5 * * * *', () => {
    cleanupOrphanWarranties();
  });

  logger.info('[orphanCleanup] Cron job iniciado: limpieza cada 5 minutos');
};

module.exports = {
  startOrphanCleanupCron,
  cleanupOrphanWarranties,
};
