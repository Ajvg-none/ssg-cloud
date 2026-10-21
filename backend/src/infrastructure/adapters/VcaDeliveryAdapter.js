// backend/src/infrastructure/adapters/VcaDeliveryAdapter.js
const vcaService = require('../../services/vcaService');

class VcaDeliveryAdapter {
  async deliver(warranty, store, lab) {
    return vcaService.deliverAndMark(warranty, store, lab);
  }
}

module.exports = VcaDeliveryAdapter;
