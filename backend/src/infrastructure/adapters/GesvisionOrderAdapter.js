// backend/src/infrastructure/adapters/GesvisionOrderAdapter.js
// Adapta el cliente legacy de GesVision al puerto OrderProvider.
const { fetchAndMapOrder } = require('../../legacy');

class GesvisionOrderAdapter {
  async getOrder(orderNumber) {
    return fetchAndMapOrder(orderNumber);
  }
}

module.exports = GesvisionOrderAdapter;
