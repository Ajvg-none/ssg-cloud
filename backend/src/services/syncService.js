// backend/src/services/syncService.js
// Fachada de compatibilidad: la lógica vive en SyncOrderUseCase.
const { useCases } = require('../container');

async function syncOrder(orderNumber) {
  return useCases.syncOrderUseCase.execute(orderNumber);
}

module.exports = { syncOrder };
