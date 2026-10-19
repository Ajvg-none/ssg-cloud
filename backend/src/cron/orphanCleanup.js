// backend/src/cron/orphanCleanup.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const cron = require('node-cron');
const logger = require('../config/logger');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Tarea programada que se ejecuta cada 5 minutos.
 * Busca garantías en estado PROCESSING con processingStartedAt > 5 minutos
 * y las resetea a PENDING (RF-04.2).
 */
const cleanupOrphanWarranties = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    logger.info('[orphanCleanup] Iniciando limpieza de garantías huérfanas...', {
      threshold: fiveMinutesAgo.toISOString(),
    });

    // Buscar garantías PROCESSING antiguas
    const orphanWarranties = await prisma.warranty.findMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: {
          lt: fiveMinutesAgo,
        },
      },
      select: {
        id: true,
        orderNumber: true,
        labId: true,
        processingStartedAt: true,
      },
    });

    if (orphanWarranties.length === 0) {
      logger.info('[orphanCleanup] No hay garantías huérfanas.');
      return;
    }

    logger.warn(`[orphanCleanup] Encontradas ${orphanWarranties.length} garantía(s) huérfana(s)`, {
      warrantyIds: orphanWarranties.map((w) => w.id),
    });

    // Resetear a PENDING
    const result = await prisma.warranty.updateMany({
      where: {
        id: {
          in: orphanWarranties.map((w) => w.id),
        },
      },
      data: {
        status: 'PENDING',
        processingStartedAt: null,
      },
    });

    logger.info(`[orphanCleanup] ${result.count} garantía(s) reseteada(s) a PENDING`);

    // Log detallado de cada garantía reseteada
    orphanWarranties.forEach((w) => {
      logger.warn(`[orphanCleanup] Garantía huérfana reseteada`, {
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

/**
 * Inicia el cron job cada 5 minutos.
 */
const startOrphanCleanupCron = () => {
  // Cada 5 minutos (0 */5 * * * *)
  cron.schedule('*/5 * * * *', () => {
    cleanupOrphanWarranties();
  });

  logger.info('[orphanCleanup] Cron job iniciado: limpieza cada 5 minutos');
};

module.exports = {
  startOrphanCleanupCron,
  cleanupOrphanWarranties, // Exportado para pruebas manuales
};