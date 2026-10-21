// backend/src/infrastructure/adapters/GesvisionProductAdapter.js
const gesvisionApi = require('../../legacy/gesvisionApi');

class GesvisionProductAdapter {
  async getByCode(code) {
    return gesvisionApi.searchProductByReference(code);
  }
}

module.exports = GesvisionProductAdapter;
