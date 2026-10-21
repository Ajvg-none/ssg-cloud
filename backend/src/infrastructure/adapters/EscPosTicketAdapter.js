// backend/src/infrastructure/adapters/EscPosTicketAdapter.js
const { generateEscPosBuffer } = require('../../legacy/printer');

class EscPosTicketAdapter {
  async render(order, items) {
    return generateEscPosBuffer(order, items);
  }
}

module.exports = EscPosTicketAdapter;
