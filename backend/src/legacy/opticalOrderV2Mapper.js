// backend/src/legacy/opticalOrderV2Mapper.js
const logger = require('../config/logger');

/**
 * Mapeo de enum `lensType` de la API v2 (GESMO) a los códigos cortos de v1.
 * - FAR / TORIC                        -> L (monofocal / lejos)
 * - NEAR / OCCUPATIONAL / INTERMEDIATE -> C (cerca)
 * - BIFOCAL                            -> B
 * - PROGRESSIVE / MULTIFOCAL           -> P (progresivo)
 * Si ya llega un código corto v1 (L/C/B/P) se respeta. Valores desconocidos se
 * devuelven tal cual para que `inferTipoLenteFromItems` los resuelva.
 */
const LENS_TYPE_V2_TO_V1 = {
  FAR: 'L',
  TORIC: 'L',
  NEAR: 'C',
  OCCUPATIONAL: 'C',
  INTERMEDIATE: 'C',
  BIFOCAL: 'B',
  PROGRESSIVE: 'P',
  MULTIFOCAL: 'P'
};

const SHORT_CODES = new Set(['L', 'C', 'B', 'P']);

/**
 * Normaliza un valor de `lensType` v2 al código corto v1.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function mapLensType(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value).trim().toUpperCase();
  if (SHORT_CODES.has(key)) return key;
  if (LENS_TYPE_V2_TO_V1[key]) return LENS_TYPE_V2_TO_V1[key];
  logger.warn(`⚠️ [opticalOrderV2Mapper] lensType v2 desconocido: '${value}'. Se pasa tal cual.`);
  return value;
}

/**
 * Mapea la prescripción de un ojo (EyePrescriptionDocument) al contrato v1.
 *
 * ⚠️ RIESGO CLÍNICO — la semántica de DP viene invertida respecto a su nombre:
 *   - v2 `farMonocularPd`  -> v1 `nearPupilCenter`     (DP de cerca)
 *   - v2 `nearMonocularPd` -> v1 `distancePupilCenter` (DP de lejos)
 *
 * @param {Object|null|undefined} eye - Objeto rightEye/leftEye de v2.
 * @param {'right'|'left'} side - Lado del ojo.
 * @returns {Object} Bloque opticalDataOD/OI en formato v1.
 */
function mapEye(eye, side) {
  const e = eye || {};
  return {
    id: e.id ?? null,
    eye: side === 'right' ? 'D' : 'I',
    lensType: mapLensType(e.lensType),
    lensMaterial: e.crystalType ?? null,
    sphere: e.sphere ?? null,
    cylinder: e.cylinder ?? null,
    axis: e.axis ?? null,
    addition: e.addition ?? null,
    near: e.near ?? null,
    prism: e.prism ?? null,
    baseDirection: e.base ?? '',
    diameter: e.diameter ?? null,
    baseCurve: e.baseCurve ?? null,
    height: e.height ?? null,
    // DP invertidas intencionalmente (riesgo clínico documentado)
    distancePupilCenter: e.nearMonocularPd ?? null,
    nearPupilCenter: e.farMonocularPd ?? null,
    batchNumber: e.lotNumber ?? null
  };
}

/**
 * Transforma un `OpticalOrderDocument` de la API v2 al contrato exacto que
 * consume `fetchAndMapOrder` (forma de `GET /glasses-orders/{id}` v1).
 *
 * No altera BD, pipeline, VCA ni impresión: solo normaliza el objeto externo.
 *
 * @param {Object} v2Detail - Respuesta de `GET /api/v2/optical-orders/{id}`.
 * @param {Object|null} [v2ListItem] - Ítem de la lista v2, usado como fallback
 *   para campos que el detalle omite (p.ej. documentDate, firstPrintDate).
 * @returns {Object} Objeto con forma v1.
 */
function mapOpticalOrderV2ToV1(v2Detail, v2ListItem = null) {
  if (!v2Detail || typeof v2Detail !== 'object') {
    throw new Error('mapOpticalOrderV2ToV1: v2Detail inválido');
  }
  const d = v2Detail;
  const l = v2ListItem || {};

  const rightEye = d.rightEye || null;
  const leftEye = d.leftEye || null;

  return {
    // ---- Cabecera ----
    id: d.id ?? null,
    serial: d.series ?? l.series ?? null,
    number: d.number ?? null,
    code: d.code ?? null,
    customerId: d.customerId ?? l.customerId ?? null,
    warehouseId: d.warehouseId ?? l.warehouseId ?? null,
    optometryExamId: d.optometricExamId ?? l.optometricExamId ?? null,
    status: d.documentStatusName ?? null,

    // ---- Banderas clave ----
    orderFromSupplier: !!(d.requestSupplier ?? l.requestSupplier), // FP
    customerOwnFrame: !!(d.ownFrame ?? l.ownFrame),
    inHouseManufacturing: !!(d.ownManufacturing ?? l.ownManufacturing),
    bevelingSent: !!(d.bevelSent ?? l.bevelSent),

    // ---- Referencias / vínculos ----
    issuedInvoiceId: d.invoiceId ?? l.invoiceId ?? null,
    issuedOrderId: d.customerOrderId ?? l.customerOrderId ?? null,
    frameId: d.frameProductId ?? l.frameProductId ?? null,
    productionOrderId: d.productionOrderId ?? l.productionOrderId ?? null,

    // ---- Geometría de montura ----
    frameType: d.frameType ?? l.frameType ?? null,
    horizontal: d.frameHorizontal ?? l.frameHorizontal ?? null,
    vertical: d.frameVertical ?? l.frameVertical ?? null,
    bridge: d.frameBridge ?? l.frameBridge ?? null,
    maxDiameter: d.frameBiggestDiameter ?? l.frameBiggestDiameter ?? null,

    // ---- Alturas a nivel de orden (fallback de altura pupilar) ----
    heightOD: d.heightRightEye ?? l.heightRightEye ?? null,
    heightOI: d.heightLeftEye ?? l.heightLeftEye ?? null,

    // ---- Distancias de respaldo para mapDP ----
    pupillaryDistance: d.pupillaryDistance ?? l.pupillaryDistance ?? null,
    averageDistance: d.averageDistance ?? d.medianDistance ?? l.averageDistance ?? l.medianDistance ?? null,
    medianDistance: d.medianDistance ?? l.medianDistance ?? null,

    // ---- Fechas / metadatos (fallback desde lista) ----
    date: d.documentDate ?? l.documentDate ?? null,
    firstPrintDate: d.firstPrintDate ?? l.firstPrintDate ?? null,
    reference: d.reference ?? null,

    // ---- Datos de conveniencia (no rompen el contrato v1) ----
    customerName: d.customerName ?? l.customerName ?? null,
    warehouseName: d.warehouseName ?? l.warehouseName ?? null,
    // v2 no expone /employees ni un ID de asesor en la orden: el usuario creador es la única fuente.
    createdBy: d.createdBy ?? l.createdBy ?? null,

    // ---- Fórmula óptica ----
    opticalDataOD: mapEye(rightEye, 'right'),
    opticalDataOI: mapEye(leftEye, 'left')
  };
}

module.exports = { mapOpticalOrderV2ToV1, mapLensType };
