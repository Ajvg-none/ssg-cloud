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

// Tipos del laboratorio (decisión directiva): al elegir categoría LABORATORIO,
// cualquiera de estos 3 tipos NO genera VCA ni ticket (nada se entrega desde el
// lab), PERO SÍ genera la Orden de Garantía A4 (impresa por la tienda) y la
// garantía nace COMPLETED. La lista de bloqueo queda vacía (mecanismo disponible
// para el futuro).
const LAB_WARRANTY_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];

const CATEGORIES = {
  TIENDA: {
    key: 'TIENDA',
    label: 'Tienda',
    warrantyTypes: TIENDA_WARRANTY_TYPES,
    blockedWarrantyTypes: [],
    blockedReason: null,
    // Política de entrega: la tienda genera VCA + ticket como siempre
    // (el Caso 2 "nueva OT pagada" sigue rebajándolos a false por tipo).
    deliverVca: true,
    printTicket: true,
  },
  LABORATORIO: {
    key: 'LABORATORIO',
    label: 'Laboratorio',
    // ✅ HABILITADOS (decisión directiva): cualquiera de estos 3 tipos NO genera
    // VCA ni ticket (no hay nada que entregar desde el lab), pero SÍ genera la
    // Orden de Garantía A4 (impresa por la tienda) y nace COMPLETED.
    // El bloqueo (blockedWarrantyTypes) queda vacío y disponible para el futuro.
    warrantyTypes: LAB_WARRANTY_TYPES,
    blockedWarrantyTypes: [],
    blockedReason: null,
    // Política de entrega por categoría (el use case los combina con la lógica
    // por tipo): false = esta categoría NUNCA entrega VCA ni imprime ticket.
    deliverVca: false,
    printTicket: false,
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
 * @returns {{ key: string, label: string, warrantyTypes: string[], blockedWarrantyTypes: string[], blockedReason: string|null, deliverVca: boolean, printTicket: boolean } | null}
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
    deliverVca: def.deliverVca !== false,
    printTicket: def.printTicket !== false,
  };
}

module.exports = {
  DEFAULT_CATEGORY,
  CATEGORIES,
  TIENDA_WARRANTY_TYPES,
  LAB_WARRANTY_TYPES,
  getCategory,
};
