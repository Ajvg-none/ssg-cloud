// backend/src/utils/warrantyCase.js
//
// Lógica pura del tipo de garantía "Error de Tipo de Lente (Material)".
// Sin acceso a BD ni red: los warns del helper de códigos usan `console`
// para poder testearte offline (el controller ya loggea con winston).
//
// Dos casos operativos:
//   - SAME_ORDER: el cliente NO paga diferencia → se procesa la misma OT con
//     código de montura y cristal nuevos (VCA + ticket como siempre).
//   - NEW_ORDER: el cliente SÍ paga diferencia → se registra la nueva OT, NO
//     genera VCA ni ticket y nace COMPLETED.

const LENS_MATERIAL_TYPE = 'Error de Tipo de Lente (Material)';
const VALID_WARRANTY_CASES = ['SAME_ORDER', 'NEW_ORDER'];

// Código de artículo: letra inicial + al menos 3 caracteres (ej: M121603, H000014).
const ARTICLE_CODE_REGEX = /^[A-Z][A-Z0-9]{3,}$/;

/**
 * ¿El tipo de garantía es "Error de Tipo de Lente (Material)"?
 * @param {*} warrantyType
 * @returns {boolean}
 */
function isLensMaterialType(warrantyType) {
  return warrantyType === LENS_MATERIAL_TYPE;
}

/**
 * Valida un código de artículo (mayúsculas, letra inicial + 3+ caracteres).
 * @param {*} code
 * @returns {boolean}
 */
function isValidCode(code) {
  return typeof code === 'string' && ARTICLE_CODE_REGEX.test(code.trim().toUpperCase());
}

/**
 * Reemplaza el código de TODOS los ítems de montura con `newFrameCode` y
 * TODOS los ítems de cristal con `newLensCode`, preservando el resto.
 * Normaliza a mayúsculas y actualiza `codigo_articulo`, `codigo_completo`
 * y `prefijo` (exactamente las claves que produce el mapper de GesVision).
 * Si se pasó `newDescriptions` (resuelto contra GesVision), también actualiza
 * la `descripcion` del ítem con la del artículo NUEVO (el artículo cambió:
 * la descripción vieja ya no le corresponde).
 * Si no hay ítems de un tipo, no lanza: se prosigue (el VCA mostrará
 * PENDIENTE para ese campo, comportamiento existente).
 * @param {Object} orderData - orderData original mapeado de GesVision.
 * @param {string} newFrameCode
 * @param {string} newLensCode
 * @param {{frame?: string, lens?: string}} [newDescriptions] - Descripciones resueltas.
 * @returns {Object} orderData con items actualizados.
 */
function applyNewArticleCodes(orderData, newFrameCode, newLensCode, newDescriptions = {}) {
  const frame = String(newFrameCode || '').trim().toUpperCase();
  const lens = String(newLensCode || '').trim().toUpperCase();
  const frameDesc = newDescriptions.frame ? String(newDescriptions.frame).trim() : '';
  const lensDesc = newDescriptions.lens ? String(newDescriptions.lens).trim() : '';
  const items = (orderData.items || []).map((item) => {
    if (item.es_montura && frame) {
      return {
        ...item,
        ...(frameDesc ? { descripcion: frameDesc } : {}),
        codigo_articulo: frame,
        codigo_completo: frame,
        prefijo: frame.charAt(0),
      };
    }
    if (item.es_cristal && lens) {
      return {
        ...item,
        ...(lensDesc ? { descripcion: lensDesc } : {}),
        codigo_articulo: lens,
        codigo_completo: lens,
        prefijo: lens.charAt(0),
      };
    }
    return item;
  });

  const frameItems = items.filter((i) => i.es_montura).length;
  const lensItems = items.filter((i) => i.es_cristal).length;
  if (frameItems === 0) {
    console.warn(`[applyNewArticleCodes] Orden sin items de montura; no se aplica newFrameCode=${frame}`);
  }
  if (lensItems === 0) {
    console.warn(`[applyNewArticleCodes] Orden sin items de cristal; no se aplica newLensCode=${lens}`);
  }
  return { ...orderData, items };
}

/**
 * Valida y normaliza el payload del tipo "Error de Tipo de Lente (Material)".
 * Función PURA usada por createWarranty: retornar objecto "error" con mensaje
 * cuando la entrada es inválida (el controller responde 400 con ese texto).
 * Los demás tipos de garantía pasan intactos (flags por defecto, sin campos).
 * @param {Object} body - { warrantyType, warrantyCase, newFrameCode, newLensCode, newOrderNumber }
 * @returns {Object} { error } | { requiresVca, requiresTicket, isNewOrderPaid,
 *                              normalizedCase, normalizedFrameCode,
 *                              normalizedLensCode, normalizedNewOrder }
 */
function normalizeLensMaterialInput(body) {
  const { warrantyType, warrantyCase, newFrameCode, newLensCode, newOrderNumber } = body || {};

  // Valores por defecto para todos los tipos (comportamiento actual intacto).
  const result = {
    requiresVca: true,
    requiresTicket: true,
    isNewOrderPaid: false,
    normalizedCase: null,
    normalizedFrameCode: null,
    normalizedLensCode: null,
    normalizedNewOrder: null,
  };

  if (!isLensMaterialType(warrantyType)) {
    // Cualquier otro tipo: el caso NO aplica (se ignora, aunque llegue seteado).
    return result;
  }

  if (!VALID_WARRANTY_CASES.includes(warrantyCase)) {
    return { error: 'Debe indicar si el cliente paga diferencia (SAME_ORDER o NEW_ORDER).' };
  }

  if (warrantyCase === 'SAME_ORDER') {
    if (!isValidCode(newFrameCode)) {
      return { error: 'El nuevo código de montura es obligatorio y debe empezar con letra (ej: M121603).' };
    }
    if (!isValidCode(newLensCode)) {
      return { error: 'El nuevo código de cristal es obligatorio y debe empezar con letra (ej: H000014).' };
    }
    return {
      ...result,
      normalizedCase: 'SAME_ORDER',
      normalizedFrameCode: newFrameCode.trim().toUpperCase(),
      normalizedLensCode: newLensCode.trim().toUpperCase(),
    };
  }

  // NEW_ORDER
  if (!newOrderNumber || !String(newOrderNumber).trim()) {
    return { error: 'Debe indicar la nueva OT generada en GesVision.' };
  }
  return {
    ...result,
    normalizedCase: 'NEW_ORDER',
    normalizedNewOrder: String(newOrderNumber).trim(),
    requiresVca: false,
    requiresTicket: false,
    isNewOrderPaid: true,
  };
}

module.exports = {
  LENS_MATERIAL_TYPE,
  VALID_WARRANTY_CASES,
  ARTICLE_CODE_REGEX,
  isLensMaterialType,
  isValidCode,
  applyNewArticleCodes,
  normalizeLensMaterialInput,
};
