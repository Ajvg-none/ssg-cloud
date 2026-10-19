'use strict';
//
// Bootstrap + utilidades compartidas por la suite v2.
// IMPORTANTE: fija variables de entorno ANTES de que cualquier spec requiera
// los módulos de producción (config/gesvision.js lee env en load).
//
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.GESVISION_URL = 'https://example.test/gesmo/rest/api';
process.env.GESVISION_USER = 'test_user';
process.env.GESVISION_PASS = 'test_pass';
delete process.env.GESVISION_API_V2_URL;

const mockModule = require('./mock');

const RESETTABLE_MODULES = [
  '../../src/config/gesvision.js',
  '../../src/legacy/gesvisionApi.js',
  '../../src/legacy/opticalOrderV2Mapper.js',
  '../../src/legacy/fetchAndMapOrder.js',
];

/** Borra del require.cache los módulos con estado module-level. */
function resetModules() {
  for (const rel of RESETTABLE_MODULES) {
    try { delete require.cache[require.resolve(rel)]; } catch { /* noop */ }
  }
}

/** Instala el axios falso y devuelve el mock activo. */
function mock() {
  mockModule.install();
  return mockModule.getMock();
}

/** Devuelve el mock actualmente vinculado al módulo bajo prueba (NO reinstala). */
function use() {
  return mockModule.getMock();
}

/** Carga fresca de gesvisionApi con axios falso ya instalado. */
function freshApi() {
  mock();
  resetModules();
  return require('../../src/legacy/gesvisionApi.js');
}

/** Carga fresca de fetchAndMapOrder (con axios falso). */
function freshFetch() {
  mock();
  resetModules();
  return require('../../src/legacy/fetchAndMapOrder.js');
}

/** Carga fresca del mapper (puro, sin red). */
function freshMapper() {
  resetModules();
  return require('../../src/legacy/opticalOrderV2Mapper.js');
}

/**
 * Envuelve un handler para responder siempre el signin de v1.
 * @param {(cfg:Object)=>Promise<{data:*}>} fn
 * @returns {(cfg:Object)=>Promise<{data:*}>}
 */
function handler(fn) {
  return async (cfg) => {
    if (String(cfg.url).endsWith('/auth/signin')) return 'Bearer test-token';
    return fn(cfg);
  };
}

/**
 * Sustituye global.setTimeout por una versión instantánea para hacer
 * deterministas los backoffs (auth/retry) sin esperas reales.
 * @param {()=>Promise<*>} fn
 */
async function withInstantTimers(fn) {
  const real = global.setTimeout;
  global.setTimeout = (cb) => { try { cb(); } catch { /* noop */ } return 0; };
  try {
    return await fn();
  } finally {
    global.setTimeout = real;
  }
}

// ---------------------------------------------------------------------------
// Constructores de datos v2
// ---------------------------------------------------------------------------
function envelope(data, extra = {}) {
  return { data, totalCount: data.length, skip: 0, limit: 200, hasMore: false, ...extra };
}

function listItem(over = {}) {
  return {
    id: 1,
    series: '1142',
    number: 1925,
    customerId: 10,
    warehouseId: 4,
    customerName: 'Juan Perez',
    warehouseName: 'Santo Tomé',
    createdBy: 'user1',
    requestSupplier: true,
    ownFrame: false,
    ownManufacturing: false,
    bevelSent: false,
    invoiceId: 555,
    customerOrderId: 666,
    frameProductId: 777,
    frameType: 'CO',
    frameHorizontal: 54,
    frameVertical: 39,
    frameBridge: 17,
    frameBiggestDiameter: 58,
    documentDate: '2026-03-15T10:30:00+01:00',
    ...over,
  };
}

function eye(over = {}) {
  return {
    id: 1,
    eye: 'RIGHT',
    lensType: 'FAR',
    crystalType: 'CR',
    sphere: 1.25,
    cylinder: -0.75,
    axis: 90,
    addition: 1.5,
    near: 0.5,
    prism: 2,
    base: 'IN',
    diameter: 65,
    baseCurve: 6,
    height: 24,
    farMonocularPd: 30.5,
    nearMonocularPd: 29.5,
    lotNumber: 'L1',
    ...over,
  };
}

function detail(over = {}) {
  return {
    id: 1,
    series: '1142',
    number: 1925,
    code: '114200001925',
    customerId: 10,
    warehouseId: 4,
    customerName: 'Juan Perez',
    warehouseName: 'Santo Tomé',
    createdBy: 'user1',
    requestSupplier: true,
    ownFrame: false,
    ownManufacturing: false,
    bevelSent: false,
    invoiceId: 555,
    customerOrderId: 666,
    frameProductId: 777,
    documentStatusName: 'Pendiente',
    frameType: 'CO',
    frameHorizontal: 54,
    frameVertical: 39,
    frameBridge: 17,
    frameBiggestDiameter: 58,
    pupillaryDistance: 62,
    medianDistance: 61,
    documentDate: '2026-03-15T10:30:00+01:00',
    heightRightEye: 24,
    heightLeftEye: 25,
    rightEye: eye({ eye: 'RIGHT' }),
    leftEye: eye({ eye: 'LEFT', farMonocularPd: 31, nearMonocularPd: 30 }),
    ...over,
  };
}

function line(over = {}) {
  return {
    productId: 100,
    extendedDescription: null,
    productDescription: null,
    productName: null,
    quantity: 1,
    ...over,
  };
}

/**
 * Líneas reales de la factura 133844 (orden 100000001933, Puente Cristal),
 * tomadas de la API v2 de GesVision. Sirven como fixture dorado para que los
 * códigos de ítem no se desvíen de lo que muestra GesVision.
 * @param {Object} [over] - Sobrescrituras por línea (índice 0..3).
 * @returns {Array<Object>}
 */
function goldenLines100000001933(over = {}) {
  return [
    line({ productId: 147017, productBarcode: 'M121603', productName: 'MM2091 145 C1 NEGRA', productDescription: 'MM2091 145 C1 NEGRA', lineDescription: 'MM2091 145 C1 NEGRA', opticalRole: 'FRAME', quantity: 1, ...over[0] }),
    line({ productId: 72, productBarcode: 'H000014 ', productName: 'VS Hi Index HEV+ AR (B) Premium T', productDescription: 'VS Hi Index HEV+ AR (B) Premium T', lineDescription: 'VS Hi Index HEV+ AR (B) Premium T', opticalRole: 'LENS', opticalEye: 'RIGHT', quantity: 1, ...over[1] }),
    line({ productId: 72, productBarcode: 'H000014 ', productName: 'VS Hi Index HEV+ AR (B) Premium T', productDescription: 'VS Hi Index HEV+ AR (B) Premium T', lineDescription: 'VS Hi Index HEV+ AR (B) Premium T', opticalRole: 'LENS', opticalEye: 'LEFT', quantity: 1, ...over[2] }),
    line({ productId: 1980, productBarcode: 'E000063', productName: 'ESTUCHES OPTICOLOR', productDescription: 'ESTUCHES OPTICOLOR', lineDescription: 'ESTUCHES OPTICOLOR', quantity: 1, ...over[3] }),
  ];
}

/**
 * Router genérico para el flujo fetchAndMapOrder.
 * @param {Object} [over] - Sobrescrituras por ruta.
 */
function orderRouter(over = {}) {
  return handler(async (cfg) => {
    const u = new URL(cfg.url);
    const path = u.pathname;
    const filter = u.searchParams.get('filter');

    if (path === '/api/v2/optical-orders' && !filter) {
      if (over.list) return over.list(cfg, u);
      return envelope([listItem()]);
    }
    if (path === '/api/v2/optical-orders' && filter) {
      if (over.search) return over.search(cfg, u, filter);
      return envelope([listItem()]);
    }
    if (path.startsWith('/api/v2/optical-orders/')) {
      if (over.detail) return over.detail(cfg, u);
      return detail();
    }
    if (path.startsWith('/api/v2/sales-invoices/')) {
      if (over.invoice) return over.invoice(cfg, u);
      return { lines: [line()] };
    }
    if (path.startsWith('/api/v2/sales-orders/')) {
      if (over.salesOrder) return over.salesOrder(cfg, u);
      return { lines: [] };
    }
    if (path.startsWith('/api/v2/products/')) {
      if (over.product) return over.product(cfg, u);
      return { reference: 'M100', description: 'Montura Acetato' };
    }
    if (path.startsWith('/api/v2/customers/')) {
      return { name: 'Juan', lastName: 'Perez' };
    }
    return { data: [], totalCount: 0 };
  });
}

// ---------------------------------------------------------------------------
// Contrato de salida (regresión)
// ---------------------------------------------------------------------------
const EXPECTED_ORDER_KEYS = [
  'asesor_nombre', 'altura_od', 'altura_oi', 'average_distance_total',
  'cliente_nombre', 'cliente_trae_montura', 'codigo_completo', 'estado_gesvision',
  'exchange_rate', 'fecha_emision_origen', 'fecha_venta', 'issued_invoice_id',
  'issued_order_id', 'items', 'metodo_pago', 'moneda_original', 'monto_total_usd',
  'montura_diametro_max', 'montura_horizontal', 'montura_puente', 'montura_vertical',
  'od_adicion', 'od_cilindro', 'od_dp_centro', 'od_dp_cerca', 'od_dp_unico', 'od_eje', 'od_esfera',
  'oi_adicion', 'oi_cilindro', 'oi_dp_centro', 'oi_dp_cerca', 'oi_dp_unico', 'oi_eje', 'oi_esfera',
  'orden_gesvision_id', 'orden_numero', 'pupillary_distance_total',
  'referencia_interna', 'serial', 'tienda_nombre', 'tipo_lente', 'warehouse_id',
].sort();

const EXPECTED_ITEM_KEYS = [
  'cantidad', 'codigo_articulo', 'codigo_completo', 'descripcion',
  'es_cristal', 'es_montura', 'prefijo',
].sort();

module.exports = {
  mock, use, freshApi, freshFetch, freshMapper, handler, withInstantTimers,
  resetModules, envelope, listItem, eye, detail, line, goldenLines100000001933,
  orderRouter, EXPECTED_ORDER_KEYS, EXPECTED_ITEM_KEYS,
};
