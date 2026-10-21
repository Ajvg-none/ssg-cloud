// backend/src/services/warrantyTypePolicy.js
// Política temporal: tipos visibles en el catálogo pero sin lógica de negocio.
// La fuente de verdad sigue siendo warrantyCategories/registry.js.
const { listCategories } = require('../warrantyCategories');

/**
 * Devuelve el mensaje de bloqueo temporal para un tipo, o null si está habilitado.
 * Se buscan los tipos bloqueados en todas las categorías para cubrir también
 * peticiones que omitan `category`.
 * @param {*} warrantyType
 * @returns {string|null}
 */
function getTemporaryBlockReason(warrantyType) {
  if (!warrantyType) return null;
  const type = String(warrantyType).trim();
  if (!type) return null;

  for (const category of listCategories()) {
    if ((category.blockedWarrantyTypes || []).includes(type)) {
      const reason = category.blockedReason || '';
      return `El tipo de garantía "${type}" está temporalmente no disponible. ${reason}`.trim();
    }
  }

  return null;
}

module.exports = {
  getTemporaryBlockReason,
};
