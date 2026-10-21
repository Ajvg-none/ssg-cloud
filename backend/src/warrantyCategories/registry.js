// backend/src/warrantyCategories/registry.js
//
// ÚNICA fuente de verdad del dominio "categoría de garantía".
//
// La categoría indica DÓNDE ocurrió el defecto (no quién creó la garantía):
//   - TIENDA:      causado en la tienda (todos los casos históricos, implícito hoy).
//   - LABORATORIO: causado en el laboratorio.
//
// OCP: agregar una categoría futura (p. ej. PROVEEDOR) = nueva entrada en este
// mapa + valor en el enum Prisma + migración `ADD VALUE`. Nada más: ningún
// controller ni componente frontend necesita cambios (usan este módulo vía
// index.js, o consumen GET /api/warranty-categories).
//
// Módulo PURA: sin BD ni red. Los consumidores prisma/HTTP deciden cómo usar el
// descriptor (validación en controller, listado en la API de categorías).

// ------------------------------------------------------------------
// Tipos de garantía por categoría
// ------------------------------------------------------------------
// HOY: la lista vigente de tipos (es texto libre en `warranties.warranty_type`;
// el backend solo exige no vacío — igual que hasta ahora).
const TIENDA_WARRANTY_TYPES = [
  'Error de Medida',
  'Error de Transcripcion',
  'Error de RX',
  'Error de Tipo de Lente (Material)',
];

// Tipos temporales del laboratorio: visibles en el selector, pero bloqueados
// hasta que la directiva defina su lógica de negocio.
const LAB_WARRANTY_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];
const LAB_BLOCKED_WARRANTY_TYPES = [...LAB_WARRANTY_TYPES];
const LAB_BLOCKED_REASON = 'La lógica de negocio para este tipo aún no está definida.';

const CATEGORIES = {
  TIENDA: {
    key: 'TIENDA',
    label: 'Tienda',
    warrantyTypes: TIENDA_WARRANTY_TYPES,
    blockedWarrantyTypes: [],
    blockedReason: null,
  },
  LABORATORIO: {
    key: 'LABORATORIO',
    label: 'Laboratorio',
    warrantyTypes: LAB_WARRANTY_TYPES,
    blockedWarrantyTypes: LAB_BLOCKED_WARRANTY_TYPES,
    blockedReason: LAB_BLOCKED_REASON,
  },
};

// Categoría por defecto y compatibilidad hacia atrás (clientes que no envían
// la categoría / garantías históricas).
const DEFAULT_CATEGORY = 'TIENDA';

/**
 * Devuelve el descriptor de una categoría o null si no existe.
 * Resolución de warrantyTypes:
 *   - null → hereda la lista de TIENDA (categorías futuras).
 *   - []   → lista DECLARADAMENTE vacía.
 * @param {string} key - 'TIENDA' | 'LABORATORIO' | ...
 * @returns {{ key: string, label: string, warrantyTypes: string[], blockedWarrantyTypes: string[], blockedReason: string|null } | null}
 */
function getCategory(key) {
  const def = CATEGORIES[key];
  if (!def) return null;
  const types = def.warrantyTypes === null ? [...TIENDA_WARRANTY_TYPES] : [...(def.warrantyTypes || [])];
  return {
    ...def,
    warrantyTypes: types,
    blockedWarrantyTypes: [...(def.blockedWarrantyTypes || [])],
    blockedReason: def.blockedReason || null,
  };
}

module.exports = {
  DEFAULT_CATEGORY,
  CATEGORIES,
  TIENDA_WARRANTY_TYPES,
  LAB_WARRANTY_TYPES,
  LAB_BLOCKED_WARRANTY_TYPES,
  LAB_BLOCKED_REASON,
  getCategory,
};
