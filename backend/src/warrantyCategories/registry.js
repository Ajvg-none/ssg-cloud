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

const CATEGORIES = {
  TIENDA: {
    key: 'TIENDA',
    label: 'Tienda',
    warrantyTypes: TIENDA_WARRANTY_TYPES,
  },
  LABORATORIO: {
    key: 'LABORATORIO',
    label: 'Laboratorio',
    // ❗ TIPOS PROPIOS DEL LAB AÚN SIN DEFINIR (decisión directiva 2026-10):
    // [] = lista DECLARADAMENTE VACÍA, no hereda la de TIENDA. Con la lista
    // vacía NO se puede crear una garantía LABORATORIO (el controller responde
    // 400 y la UI bloquea el selector de tipo) hasta que la directiva defina
    // la lista real: rellenar ESTE array (un solo edit) y todo se activa solo.
    // (`null` sigue reservado para "hereda de TIENDA" en categorías futuras.)
    warrantyTypes: [],
  },
};

// Categoría por defecto y compatibilidad hacia atrás (clientes que no envían
// la categoría / garantías históricas).
const DEFAULT_CATEGORY = 'TIENDA';

/**
 * Devuelve el descriptor de una categoría o null si no existe.
 * Resolución de warrantyTypes:
 *   - null → hereda la lista de TIENDA (categorías futuras).
 *   - []   → lista DECLARADAMENTE vacía (no crea garantías por ahora).
 * @param {string} key - 'TIENDA' | 'LABORATORIO' | ...
 * @returns {{ key: string, label: string, warrantyTypes: string[] } | null}
 */
function getCategory(key) {
  const def = CATEGORIES[key];
  if (!def) return null;
  const types = def.warrantyTypes === null ? [...TIENDA_WARRANTY_TYPES] : [...(def.warrantyTypes || [])];
  return {
    ...def,
    warrantyTypes: types,
  };
}

module.exports = {
  DEFAULT_CATEGORY,
  CATEGORIES,
  TIENDA_WARRANTY_TYPES,
  getCategory,
};
