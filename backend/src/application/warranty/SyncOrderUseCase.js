// backend/src/application/warranty/SyncOrderUseCase.js
const logger = require('../../config/logger');

class SyncOrderUseCase {
  constructor({ orderProvider, orderCacheRepo }) {
    this.orderProvider = orderProvider;
    this.orderCacheRepo = orderCacheRepo;
  }

  async execute(orderNumber) {
    try {
      logger.info(`🔄 Iniciando sincronización de orden ${orderNumber}`);
      const mappedData = await this.orderProvider.getOrder(orderNumber);
      const cachedOrder = await this.orderCacheRepo.upsert(mappedData.orden_numero, mappedData);
      logger.info(
        `✅ Orden ${mappedData.orden_numero} sincronizada y guardada en caché (ID: ${cachedOrder.id})`
      );
      return mappedData;
    } catch (error) {
      logger.error(`❌ Error en SyncOrderUseCase: ${error.message}`);
      throw error;
    }
  }
}

module.exports = SyncOrderUseCase;
