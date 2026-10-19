// backend/src/services/syncService.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const logger = require('../config/logger');
const { fetchAndMapOrder } = require('../legacy');

// Configurar Prisma con driver adapter (Prisma v7)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Sincroniza una orden de GesVision y la guarda en el caché local.
 * @param {string|number} orderNumber - Número o ID de la orden en GesVision.
 * @returns {Promise<Object>} Datos mapeados de la orden.
 */
async function syncOrder(orderNumber) {
  try {
    logger.info(`🔄 Iniciando sincronización de orden ${orderNumber}`);

    // 1. Obtener y mapear datos usando la lógica heredada (RF-09)
    const mappedData = await fetchAndMapOrder(orderNumber);

    // 2. Guardar o actualizar en OrderCache (Prisma)
    const cachedOrder = await prisma.orderCache.upsert({
      where: { orderNumber: mappedData.orden_numero },
      update: {
        rawData: mappedData,
        updatedAt: new Date()
      },
      create: {
        orderNumber: mappedData.orden_numero,
        rawData: mappedData
      }
    });

    logger.info(`✅ Orden ${mappedData.orden_numero} sincronizada y guardada en caché (ID: ${cachedOrder.id})`);
    return mappedData;

  } catch (error) {
    logger.error(`❌ Error en syncService.syncOrder: ${error.message}`);
    throw error;
  }
}

module.exports = { syncOrder };