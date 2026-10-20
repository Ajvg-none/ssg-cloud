// backend/src/utils/responsibility.js
// Clasificación del responsable del error por tipo de garantía.
// SOLO informativo (reportes/auditoría en el panel de admin): no bloqueo,
// no validación, no participación en el flujo de creación ni en el A4.
//
// Los 3 primeros tipos son claros (la culpa es inequívoca por la naturaleza
// del error). El tipo 'Error de Tipo de Lente (Material)' es AMBIguo: la
// montura o el cristal pudieron estar mal recomendados por cualquiera de las
// dos partes, así que queda null hasta la Fase 2 (selector manual en el
// formulario de tienda), donde responsibleSource pasará a ser 'MANUAL'.

const RESPONSIBILITY_BY_TYPE = {
  'Error de Medida': 'LABORATORIO',
  'Error de Transcripcion': 'TIENDA',
  'Error de RX': 'TIENDA',
  'Error de Tipo de Lente (Material)': null,
};

/**
 * Deriva el responsable del error a partir del tipo de garantía.
 * @param {string|null} warrantyType
 * @returns {'TIENDA'|'LABORATORIO'|null}
 */
function deriveResponsibility(warrantyType) {
  return RESPONSIBILITY_BY_TYPE[warrantyType] ?? null;
}

module.exports = { RESPONSIBILITY_BY_TYPE, deriveResponsibility };
