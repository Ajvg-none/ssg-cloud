// backend/src/warrantyCategories/index.js
//
// API pública del dominio "categoría de garantía" (contrato ISP):
// los consumidores usan SOLO lo que necesitan y jamás importan la lista cruda.
// Todo lo demás vive en registry.js (single source of truth).

const { DEFAULT_CATEGORY, getCategory } = require('./registry');

/**
 * Lista completa de categorías con su lista de tipos resuelta.
 * Endpoint GET /api/warranty-categories y fallbacks del frontend.
 * @returns {Array<{ key: string, label: string, warrantyTypes: string[] }>}
 */
function listCategories() {
  // Iteramos CATEGORIES para preservar el orden de registro del mapa.
  return Object.keys(require('./registry').CATEGORIES)
    .map((key) => getCategory(key));
}

/**
 * ¿Existe exactamente esa categoría? (mayúsculas exactas, igual que el enum).
 * @param {*} value
 * @returns {boolean}
 */
function isValidCategory(value) {
  return typeof value === 'string' && getCategory(value) !== null;
}

/**
 * Normaliza la entrada del cliente a una categoría canónica.
 * COMPORTAMIENTO DE COMPATIBILIDAD: ausencia o valor nulo/blanco → TIENDA.
 * Un valor inválido NO-normalizable NO se corregirá: la API decide si responde
 * 400 (controllers) tras validar con isValidCategory.
 * @param {*} value
 * @returns {string}
 */
function normalizeCategory(value) {
  if (value === undefined || value === null) return DEFAULT_CATEGORY;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return DEFAULT_CATEGORY;
  return getCategory(trimmed) ? trimmed : null;
}

/**
 * Lista de tipos de garantía vigentes para una categoría (o default).
 * @param {*} category
 * @returns {string[] | null} null si la categoría es inválida.
 */
function listWarrantyTypes(category) {
  const def = getCategory(category);
  return def ? def.warrantyTypes : null;
}

module.exports = {
  DEFAULT_CATEGORY,
  listCategories,
  isValidCategory,
  normalizeCategory,
  listWarrantyTypes,
};
