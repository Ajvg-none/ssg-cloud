// backend/src/legacy/lensware.js
//
// Generación del contenido VCA (formato Lensware) a partir de una orden interna.
// Función pura: no accede a disco ni a base de datos. El backend local escribe
// el archivo .vca en la ruta de red del laboratorio (services/vcaService.js).
const logger = require('../config/logger');

// Salto de línea Windows (CR+LF) exigido por el formato VCA.
// Se define con String.fromCharCode para evitar secuencias de escape.
const CRLF = String.fromCharCode(13, 10);

// Letra inicial del código de artículo que identifica el tipo de ítem.
const FRAME_LETTER = 'M';
const LENS_LETTERS = ['A', 'B', 'H', 'C'];

// Descripciones de respaldo cuando el código no trae una letra reconocible.
const FRAME_HINTS = ['montura', 'armazon', 'armazón'];
const LENS_HINTS = [
  'cristal', 'lente', 'progresivo', 'bifocal', 'varilux', 'essilor',
  'hi-in', 'hi in', 'balance', 'pro ',
];

// Marcador de ítem no clasificado; Lensware lo completa luego.
const PENDING = 'PENDIENTE';
const DEFAULT_ACCN = '000';

/**
 * Normaliza valores numéricos al formato fijo requerido por VCA.
 * @param {*} value - Valor de entrada.
 * @param {number} [decimals=2] - Cantidad de decimales.
 * @returns {string}
 */
function formatVCAValue(value, decimals = 2) {
  if (value === null || value === undefined) return '0.00';

  const num = parseFloat(value);

  if (Number.isNaN(num)) return '0.00';

  return num.toFixed(decimals);
}

/**
 * Elimina espacios del código para preservarlo exacto en Lensware.
 * @param {string} code - Código original.
 * @returns {string}
 */
function cleanArticleCode(code) {
  if (!code) return '';

  return String(code).trim().replace(/\s+/g, '');
}

/**
 * ¿El texto contiene alguna de las pistas dadas?
 * @param {*} text - Descripción a inspeccionar.
 * @param {string[]} hints - Subcadenas a buscar.
 * @returns {boolean}
 */
function includesAny(text, hints) {
  const value = String(text || '').toLowerCase();
  return hints.some((hint) => value.includes(hint));
}

/**
 * Normaliza el ACCN de la tienda a los 3 dígitos que espera VCA.
 * 1-3 dígitos se rellenan con ceros; cualquier otro valor se respeta tal cual;
 * ausente → '000'.
 * @param {*} accn - Código ACCN de la tienda.
 * @returns {string}
 */
function resolveAccn(accn) {
  const raw = accn === null || accn === undefined ? '' : String(accn).trim();

  if (!raw) return DEFAULT_ACCN;

  return /^\d{1,3}$/.test(raw) ? raw.padStart(3, '0') : raw;
}

/**
 * Clasifica los ítems en montura (FRAM) y cristal (LNAM).
 * Prioridad: letra del código (M para montura; A/B/H/C para cristal) y,
 * si no alcanza, heurística por descripción. Toma el primer ítem que clasifica.
 * @param {Array<Object>} items - Ítems normalizados de la orden.
 * @returns {{ frame: string, lens: string }}
 */
function classifyItems(items) {
  let frame = PENDING;
  let lens = PENDING;

  for (const item of items) {
    const code = cleanArticleCode(item?.codigo_articulo);

    if (!code) continue;

    const letter = code.charAt(0).toUpperCase();

    if (letter === FRAME_LETTER && frame === PENDING) {
      frame = code;
      continue;
    }

    if (LENS_LETTERS.includes(letter) && lens === PENDING) {
      lens = code;
    }
  }

  if (frame === PENDING) {
    const montura = items.find((item) => includesAny(item?.descripcion, FRAME_HINTS));
    if (montura?.codigo_articulo) frame = cleanArticleCode(montura.codigo_articulo);
  }

  if (lens === PENDING) {
    const cristal = items.find(
      (item) =>
        includesAny(item?.descripcion, LENS_HINTS) &&
        !includesAny(item?.descripcion, FRAME_HINTS)
    );
    if (cristal?.codigo_articulo) lens = cleanArticleCode(cristal.codigo_articulo);
  }

  return { frame, lens };
}

/**
 * Construye el contenido VCA usando datos de la orden, ACCN y line items.
 * @param {Object} order - Orden interna normalizada (Warranty.orderData + tienda).
 * @param {Array<Object>} [items] - Ítems asociados.
 * @returns {Promise<string>} Contenido del archivo VCA.
 */
async function generateVCAContent(order, items) {
  const safeOrder = order || {};
  const safeItems = Array.isArray(items) ? items : [];

  const accn = resolveAccn(safeOrder.accn);
  if (accn === DEFAULT_ACCN) {
    logger.warn(`⚠️ Tienda ${safeOrder.tienda_id} sin código ACCN válido para VCA`);
  }

  const { frame, lens } = classifyItems(safeItems);
  logger.info(`🔬 VCA orden ${safeOrder.orden_numero}: FRAM=${frame}, LNAM=${lens}`);

  const comment = safeOrder.codigo_completo || safeOrder.orden_numero || '';
  const client = safeOrder.tienda_nombre
    ? `${accn} ${safeOrder.tienda_nombre}`
    : 'PACIENTE';

  // Par de valores OD;OI con el mismo formato numérico.
  const pair = (od, oi, decimals = 2) =>
    `${formatVCAValue(od, decimals)};${formatVCAValue(oi, decimals)}`;

  const lines = [
    'DO=B',
    `ACCN=${accn}`,
    `_COMMENT=${comment}`,
    `CLIENT=${client}`,
    `LNAM=${lens};${lens}`,
    `SPH=${pair(safeOrder.od_esfera, safeOrder.oi_esfera)}`,
    `CYL=${pair(safeOrder.od_cilindro, safeOrder.oi_cilindro)}`,
    `AX=${pair(safeOrder.od_eje, safeOrder.oi_eje, 0)}`,
    `ADD=${pair(safeOrder.od_adicion, safeOrder.oi_adicion)}`,
    `NPD=${pair(safeOrder.od_dp_centro, safeOrder.oi_dp_centro)}`,
    `IPD=${pair(safeOrder.od_dp_cerca, safeOrder.oi_dp_cerca)}`,
    `DBL=${formatVCAValue(safeOrder.montura_puente)}`,
    `SEGHT=${pair(safeOrder.altura_od, safeOrder.altura_oi)}`,
    `FRAM=${frame}`,
    '_RECTYPE=E',
  ];

  return lines.join(CRLF);
}

module.exports = {
  generateVCAContent,
  cleanArticleCode,
};
