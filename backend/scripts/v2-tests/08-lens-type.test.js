'use strict';
//
// 08-lens-type.test.js — Tests del nuevo tipo de garantía
// "Error de Tipo de Lente (Material)" (casos SAME_ORDER / NEW_ORDER).
//
// Cubre:
//   1. Helper puro applyNewArticleCodes (reemplazo total de códigos por tipo de ítem).
//   2. Helper con orden sin ítems de un tipo (no lanza; conserva el resto).
//   3. Validaciones de normalizeLensMaterialInput (Casos 1/2 + payloads inválidos).
//   4. deliverPending (patch del singleton Prisma) exige requiresVca=true, y
//      deliverAndMark salta garantías que no requieren VCA.
//
// El guard de getTicketBuffer (409 con requiresTicket=false) NO se testea aquí:
// el controller instancia Prisma propio (no inyectable); verificación manual.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const path = require('path');

const {
  LENS_MATERIAL_TYPE,
  applyNewArticleCodes,
  isValidCode,
  normalizeLensMaterialInput,
} = require('../../src/utils/warrantyCase');

// Fixture: ítems con el contrato exacto que produce fetchAndMapOrder.js
// (mapLineItems): montura M*, cristal H* x2 (OD/OI) y estuche E*.
function orderForCodes(over = {}) {
  return {
    codigo_completo: '114200001933',
    orden_numero: '114200001933',
    items: [
      { descripcion: 'MM2091 145 C1 NEGRA', cantidad: 1, codigo_articulo: 'M121603', codigo_completo: 'M121603', es_montura: true, es_cristal: false, prefijo: 'M' },
      { descripcion: 'VS Hi Index HEV+ AR (B) Premium T', cantidad: 1, codigo_articulo: 'H000014', codigo_completo: 'H000014', es_montura: false, es_cristal: true, prefijo: 'H' },
      { descripcion: 'VS Hi Index HEV+ AR (B) Premium T', cantidad: 1, codigo_articulo: 'H000014', codigo_completo: 'H000014', es_montura: false, es_cristal: true, prefijo: 'H' },
      { descripcion: 'ESTUCHES OPTICOLOR', cantidad: 1, codigo_articulo: 'E000063', codigo_completo: 'E000063', es_montura: false, es_cristal: false, prefijo: 'E' },
    ],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1) Helper puro — reemplazo total de códigos
// ---------------------------------------------------------------------------
test('applyNewArticleCodes: reemplaza TODOS los ítems de montura y TODOS los de cristal', () => {
  const fixed = applyNewArticleCodes(orderForCodes(), ' m121603x ', 'h000014y ');
  const monturas = fixed.items.filter((i) => i.es_montura);
  const cristales = fixed.items.filter((i) => i.es_cristal);
  const otros = fixed.items.filter((i) => !i.es_montura && !i.es_cristal);

  // Montura: único ítem es_montura; se actualizan las 3 claves del contrato y
  // el código se sanea (trim + mayúsculas).
  assert.equal(monturas.length, 1);
  assert.equal(monturas[0].codigo_articulo, 'M121603X');
  assert.equal(monturas[0].codigo_completo, 'M121603X');
  assert.equal(monturas[0].prefijo, 'M');
  assert.equal(monturas[0].descripcion, 'MM2091 145 C1 NEGRA', 'la descripción se preserva');

  // Cristal: AMBOS ítems (OD y OI) llevan el código nuevo.
  assert.equal(cristales.length, 2, 'debe actualizar cada ítem de cristal');
  for (const c of cristales) {
    assert.equal(c.codigo_articulo, 'H000014Y');
    assert.equal(c.codigo_completo, 'H000014Y');
    assert.equal(c.prefijo, 'H');
  }

  // Otros ítems (estuche): intactos.
  assert.equal(otros.length, 1);
  assert.equal(otros[0].codigo_articulo, 'E000063');
  assert.equal(otros[0].codigo_completo, 'E000063');
  assert.equal(otros[0].prefijo, 'E');

  // El resto del orderData se preserva (mismo objeto enriquecido).
  assert.equal(fixed.codigo_completo, '114200001933');
  assert.equal(fixed.orden_numero, '114200001933');
});

test('applyNewArticleCodes: orderData sin ítems de un tipo no lanza y conserva items', () => {
  // Solo montura: el cristal indicado simplemente no se aplica.
  const soloMontura = applyNewArticleCodes(
    { codigo_completo: 'X', items: [orderForCodes().items[0]] },
    'M999999', 'H999999'
  );
  assert.equal(soloMontura.items.length, 1);
  assert.equal(soloMontura.items[0].codigo_articulo, 'M999999');

  // Sin ítems de ningún tipo: no lanza (procede igual; el VCA mostrará PENDIENTE).
  const sinItems = { codigo_completo: 'Y', items: [] };
  const result = applyNewArticleCodes(sinItems, 'M999999', 'H999999');
  assert.doesNotThrow(() => result);
  assert.deepEqual(result.items, []);
  // Devuelve un objeto nuevo sin mutar el original.
  assert.equal(sinItems.items.length, 0);
  assert.ok(sinItems !== result);
});

// ---------------------------------------------------------------------------
// 3) Validaciones del payload (misma entrada que el controller)
// ---------------------------------------------------------------------------
const BASE = { warrantyType: LENS_MATERIAL_TYPE };

test('normaliza: caso SAME_ORDER válido → flags VCA/ticket y códigos normalizados', () => {
  const r = normalizeLensMaterialInput({
    ...BASE,
    warrantyCase: 'SAME_ORDER',
    newFrameCode: ' m121603 ',
    newLensCode: 'H000014',
  });
  assert.equal(r.error, undefined);
  assert.equal(r.normalizedCase, 'SAME_ORDER');
  assert.equal(r.normalizedFrameCode, 'M121603');
  assert.equal(r.normalizedLensCode, 'H000014');
  assert.equal(r.requiresVca, true);
  assert.equal(r.requiresTicket, true);
  assert.equal(r.isNewOrderPaid, false);
});

test('normaliza: caso NEW_ORDER válido → sin VCA, sin ticket (nace COMPLETED)', () => {
  const r = normalizeLensMaterialInput({
    ...BASE,
    warrantyCase: 'NEW_ORDER',
    newOrderNumber: ' 114200002001 ',
  });
  assert.equal(r.error, undefined);
  assert.equal(r.normalizedCase, 'NEW_ORDER');
  assert.equal(r.normalizedNewOrder, '114200002001');
  assert.equal(r.requiresVca, false);
  assert.equal(r.requiresTicket, false);
  assert.equal(r.isNewOrderPaid, true);
});

test('normaliza: rechaza caso no indicado', () => {
  const r = normalizeLensMaterialInput({ ...BASE });
  assert.match(String(r.error), /paga diferencia/);
});

test('normaliza: SAME_ORDER sin newFrameCode → 400', () => {
  const r = normalizeLensMaterialInput({ ...BASE, warrantyCase: 'SAME_ORDER', newLensCode: 'H000014' });
  assert.match(String(r.error), /montura/);
});

test('normaliza: SAME_ORDER sin newLensCode → 400', () => {
  const r = normalizeLensMaterialInput({ ...BASE, warrantyCase: 'SAME_ORDER', newFrameCode: 'M121603' });
  assert.match(String(r.error), /cristal/);
});

test('normaliza: código inválido (sin letra inicial) → 400', () => {
  const r = normalizeLensMaterialInput({ ...BASE, warrantyCase: 'SAME_ORDER', newFrameCode: '121603', newLensCode: 'H000014' });
  assert.match(String(r.error), /montura/);
  const rCorto = normalizeLensMaterialInput({ ...BASE, warrantyCase: 'SAME_ORDER', newFrameCode: 'M1', newLensCode: 'H000014' });
  assert.match(String(rCorto.error), /montura/, 'código demasiado corto también se rechaza');
});

test('normaliza: NEW_ORDER sin nueva OT → 400', () => {
  const r = normalizeLensMaterialInput({ ...BASE, warrantyCase: 'NEW_ORDER' });
  assert.match(String(r.error), /nueva OT/);
});

test('normaliza: warrantyType desconocido con warrantyCase seteado → se IGNORA (comportamiento intacto)', () => {
  const r = normalizeLensMaterialInput({
    warrantyType: 'Error de RX',
    warrantyCase: 'NEW_ORDER',
    newOrderNumber: '114200002001',
    newFrameCode: 'M121603',
    newLensCode: 'H000014',
  });
  assert.equal(r.error, undefined);
  assert.equal(r.normalizedCase, null, 'el caso del tipo desconocido no se guarda');
  assert.equal(r.requiresVca, true, 'los demás tipos conservan VCA/ticket obligatorios');
  assert.equal(r.requiresTicket, true);
  assert.equal(r.normalizedFrameCode, null);
  assert.equal(r.normalizedNewOrder, null);
});

test('isValidCode: contornos del formato de código de artículo', () => {
  assert.equal(isValidCode('M121603'), true);
  assert.equal(isValidCode(' m121603 '), true, 'trim + mayúsculas');
  assert.equal(isValidCode('H1'), false, 'mínimo 4 caracteres');
  assert.equal(isValidCode('121603'), false, 'debe empezar por letra');
  assert.equal(isValidCode('M12 603'), false, 'sin espacios internos');
  assert.equal(isValidCode(null), false);
  assert.equal(isValidCode(undefined), false);
  assert.equal(isValidCode(12345), false, 'no string → inválido');
});

// ---------------------------------------------------------------------------
// 4) Filtro del cron VCA vía singleton Prisma parcheado en require.cache
//    (mismo patrón que mock.js usa con axios).
// ---------------------------------------------------------------------------
function injectFakePrisma(fakePrisma) {
  const PRISMA_PATH = path.resolve(__dirname, '../../src/config/prisma.js');
  require.cache[PRISMA_PATH] = {
    id: PRISMA_PATH,
    filename: PRISMA_PATH,
    loaded: true,
    exports: fakePrisma,
  };
  delete require.cache[require.resolve('../../src/services/vcaService.js')];
  return require('../../src/services/vcaService.js');
}

test('vcaService: deliverPending exige requiresVca=true en el where', async () => {
  const captured = { where: null };
  let updateCalls = 0;

  const vcaService = injectFakePrisma({
    appSetting: {
      findUnique: async () => ({ key: 'vca_local_since', value: '2026-01-01T00:00:00.000Z' }),
      create: async () => ({ key: 'vca_local_since', value: '2026-01-01T00:00:00.000Z' }),
    },
    warranty: {
      findMany: async (args) => {
        captured.where = args.where;
        return []; // sin resultados: asertamos el filtro, no la entrega
      },
      findUnique: async () => null,
      update: async () => {
        updateCalls++;
        return {};
      },
    },
    lab: { findUnique: async () => null },
  });

  const stats = await vcaService.deliverPending({});

  assert.equal(captured.where.requiresVca, true, 'el cron debe filtrar requiresVca=true');
  assert.equal(captured.where.lab.vcaEnabled, true);
  assert.ok(captured.where.vcaAttempts, 'sigue el límite de reintentos');
  assert.equal(stats.total, 0);
  assert.equal(updateCalls, 0, 'sin garantías, nada se marca entregado');
});

test('vcaService: deliverAndMark salta garantías requiresVca=false sin tocar BD ni fs', async () => {
  let updateCalls = 0;

  const vcaService = injectFakePrisma({
    appSetting: {
      findUnique: async () => ({ key: 'vca_local_since', value: '2026-01-01T00:00:00.000Z' }),
      create: async () => ({ key: 'vca_local_since', value: '2026-01-01T00:00:00.000Z' }),
    },
    warranty: {
      findMany: async () => [],
      findUnique: async () => null,
      update: async () => {
        updateCalls++;
        return {};
      },
    },
    lab: { findUnique: async () => null },
  });

  // lab con path REAL local: si el guard fallara, intentaría escribir el .vca ahí.
  const result = await vcaService.deliverAndMark(
    { id: 'w-neworder', orderNumber: '114200002001', storeId: 's1', requiresVca: false, orderData: {} },
    { id: 's1', name: 'Tienda', accn: '001' },
    { id: 'l1', name: 'Lab', vcaNetworkPath: path.join(__dirname, 'tmp-no-debe-crearse'), vcaEnabled: true }
  );

  assert.deepEqual(result, { delivered: false, skipped: 'not_required' });
  assert.equal(updateCalls, 0, 'no marca vcaDeliveredAt ni reintentos');
  assert.ok(!require('fs').existsSync(path.join(__dirname, 'tmp-no-debe-crearse')), 'no debe crearse carpeta tmp');
});

// ============================================================
// NUEVO: descripciones resueltas desde GesVision (Caso 1)
// ============================================================

test('applyNewArticleCodes: con newDescriptions actualiza tambien la descripcion del item reemplazado', () => {
  const fixed = applyNewArticleCodes(orderForCodes(), 'M121603X', 'H000014Y', {
    frame: 'MM2091 145 C1 NEGRA',
    lens: 'VS Hi Index HEV+ AR (B) Premium T',
  });
  assert.equal(fixed.items[0].descripcion, 'MM2091 145 C1 NEGRA', 'la montura lleva la descripcion NUEVA');
  assert.equal(fixed.items[1].descripcion, 'VS Hi Index HEV+ AR (B) Premium T', 'el cristal lleva la descripcion NUEVA');
  assert.equal(fixed.items[0].descripcion, 'MM2091 145 C1 NEGRA', 'la montura lleva la descripcion NUEVA');
});

test('applyNewArticleCodes: sin newDescriptions conserva la descripcion original (retrocompatible)', () => {
  const fixed = applyNewArticleCodes(orderForCodes(), 'M121603X', 'H000014Y');
  assert.equal(fixed.items[0].descripcion, 'MM2091 145 C1 NEGRA', 'descripcion original intacta');
  assert.equal(fixed.items[1].descripcion, 'VS Hi Index HEV+ AR (B) Premium T', 'descripcion original intacta');
});

test('applyNewArticleCodes: descripcion parcial (solo frame) no toca la descripcion del cristal', () => {
  const fixed = applyNewArticleCodes(orderForCodes(), 'M121603X', 'H000014Y', { frame: 'DESC-NUEVA' });
  assert.equal(fixed.items[0].descripcion, 'DESC-NUEVA');
  assert.equal(fixed.items[1].descripcion, 'VS Hi Index HEV+ AR (B) Premium T', 'sin descripcion resuelta se conserva la original');
});

// ============================================================
// NUEVO: searchProductByReference (GET /products?filter=reference==)
// ============================================================

test('searchProductByReference: reference filtrable -> devuelve {id, reference, description} recortada', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async (cfg) => {
    assert.ok(decodeURIComponent(cfg.url).includes('reference=="M121603"'), 'debe filtrar por reference');
    return [{ id: 145769, reference: 'M121603', description: 'MM2091 145 C1 NEGRA' }];
  }));
  const product = await api.searchProductByReference(' M121603 ');
  assert.deepEqual(product, { id: 145769, reference: 'M121603', description: 'MM2091 145 C1 NEGRA' });
});

test('searchProductByReference: codigo inexistente -> null (un solo request, sin barrido de respaldo)', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async () => []));
  const product = await api.searchProductByReference('ZZ999999');
  assert.equal(product, null);
  assert.equal(h.use().calls.length, 2, 'signin + un solo request de productos');
});

test('searchProductByReference: vacio -> null sin llamar a la API', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async () => []));
  assert.equal(await api.searchProductByReference('   '), null);
  assert.equal(h.use().calls.length, 0, 'nunca debe llamar al API con un codigo vacio');
});
