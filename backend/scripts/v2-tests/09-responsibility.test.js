// backend/scripts/v2-tests/09-responsibility.test.js
// Responsable del error (Opción 5, solo informativo):
//   1. deriveResponsibility: mapeo exacto de los 4 tipos + desconocido.
//   2. createWarranty persiste responsibleParty/responsibleSource (AUTO),
//      ignora responsibleParty del body, y guarda null/null para el tipo Lente.
// Patrón de la suite: módulo bajo prueba cargado fresco con dependencias
// falsas interceptadas en Module._load (como mock.js hace con axios),
// porque storeController crea su PROPIO PrismaClient (no el singleton).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const {
  RESPONSIBILITY_BY_TYPE,
  deriveResponsibility,
} = require('../../src/utils/responsibility');

const WARRANTY_TYPES = [
  'Error de Medida',
  'Error de Transcripcion',
  'Error de RX',
  'Error de Tipo de Lente (Material)',
];

// ------------------------------------------------------------
// 1. Mapeo puro
// ------------------------------------------------------------

test('RESPONSIBILITY_BY_TYPE: cubre EXACTAMENTE los 4 tipos de garantía', () => {
  assert.deepEqual(Object.keys(RESPONSIBILITY_BY_TYPE).sort(), [...WARRANTY_TYPES].sort());
});

test('deriveResponsibility: Medida=LABORATORIO; Transcripcion y RX=TIENDA', () => {
  assert.equal(deriveResponsibility('Error de Medida'), 'LABORATORIO');
  assert.equal(deriveResponsibility('Error de Transcripcion'), 'TIENDA');
  assert.equal(deriveResponsibility('Error de RX'), 'TIENDA');
});

test('deriveResponsibility: Lente AMBIguo -> null (queda para la Fase 2)', () => {
  assert.equal(deriveResponsibility('Error de Tipo de Lente (Material)'), null);
});

test('deriveResponsibility: tipo desconocido o vacío -> null (nunca lanza)', () => {
  assert.equal(deriveResponsibility('Garantia Fantasma'), null);
  assert.equal(deriveResponsibility(''), null);
  assert.equal(deriveResponsibility(null), null);
  assert.equal(deriveResponsibility(undefined), null);
});

// ------------------------------------------------------------
// 2. createWarranty: persistencia del responsable
// ------------------------------------------------------------

const sampleOrderData = {
  codigo_completo: '114200001933',
  orden_numero: '114200001933',
  items: [
    {
      descripcion: 'X', cantidad: 1, codigo_articulo: 'M1',
      codigo_completo: 'M1', es_montura: true, es_cristal: false, prefijo: 'M',
    },
  ],
};

/** Prepara los módulos de red como stubs y carga el controller fresco. */
function loadControllerWithFakePrisma(fakePrisma) {
  // Stub del cliente GesVision: createWarranty consultala descripción de los
  // códigos nuevos en el Caso 1 — en tests NO debe pegar a la API real.
  const gesvisionPath = path.resolve(__dirname, '../../src/legacy/gesvisionApi.js');
  require.cache[gesvisionPath] = {
    id: gesvisionPath,
    filename: gesvisionPath,
    loaded: true,
    exports: {
      searchProductByReference: async (code) => ({
        id: 1,
        reference: String(code || '').trim(),
        description: `DESC [${String(code || '').trim()}]`,
      }),
    },
  };

  const realLoad = Module._load;
  const controllPath = require.resolve('../../src/controllers/storeController.js');
  delete require.cache[controllPath];
  Module._load = function (request_, parent, isMain) {
    if (request_ === '@prisma/client') {
      return { PrismaClient: function FakePrisma() { return fakePrisma; } };
    }
    if (request_ === '@prisma/adapter-pg') return { PrismaPg: function FakeAdapter() {} };
    if (request_ === 'pg') return { Pool: function FakePool() {} };
    return realLoad.apply(this, arguments);
  };
  try {
    return require('../../src/controllers/storeController.js');
  } finally {
    Module._load = realLoad;
  }
}

function makeReq(overrides = {}) {
  return {
    user: { storeId: 's1', id: 'u1' },
    body: {
      orderNumber: '114200001933',
      orderData: sampleOrderData,
      warrantyType: 'Error de Medida',
      storeObservations: '',
      ...overrides,
    },
  };
}

function makeRes() {
  const res = { statusCode: 0, payload: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.payload = payload; return res; };
  return res;
}

function fakePrismaWithCreateCapture(captured) {
  const warrantyFindMany = async () => []; // sin revisiones previas → rev 1
  const warrantyCreate = async ({ data }) => {
    captured.push(data);
    return { id: 'w1', revision: 1, orderNumber: data.orderNumber, ...data };
  };
  return {
    store: {
      findUnique: async () => ({ id: 's1', name: 'Tienda', accn: '001', labId: 'l1' }),
    },
    warranty: {
      findMany: warrantyFindMany,
      create: warrantyCreate,
    },
    lab: { findUnique: async () => null }, // fire-and-forget del VCA queda en no-op
    // El callback del controller usa `tx` (proxy con las mismas operaciones)
    $transaction: async (fn) => fn({
      warranty: { findMany: warrantyFindMany, create: warrantyCreate },
    }),
  };
}

test('createWarranty: Error de Medida persiste LABORATORIO/AUTO — ignora responsibleParty del body', async () => {
  const captured = [];
  const controller = loadControllerWithFakePrisma(fakePrismaWithCreateCapture(captured));

  // El body ENVÍA responsibleParty: en esta fase se debe IGNORAR y derivar AUTO.
  const res = makeRes();
  await controller.createWarranty(makeReq({ responsibleParty: 'LABORATORIO' }), res);

  assert.equal(res.statusCode, 201, 'espeja el flujo actual de creación');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].responsibleParty, 'LABORATORIO', 'derivado del TIPO, no del body');
  assert.equal(captured[0].responsibleSource, 'AUTO');
});

test('createWarranty: Error de RX persiste TIENDA/AUTO', async () => {
  const captured = [];
  const controller = loadControllerWithFakePrisma(fakePrismaWithCreateCapture(captured));

  const res = makeRes();
  await controller.createWarranty(makeReq({ warrantyType: 'Error de RX' }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured[0].responsibleParty, 'TIENDA');
  assert.equal(captured[0].responsibleSource, 'AUTO');
});

test('createWarranty: tipo Lente (Caso 1 SAME_ORDER) persiste null/null', async () => {
  const captured = [];
  const controller = loadControllerWithFakePrisma(fakePrismaWithCreateCapture(captured));

  const res = makeRes();
  await controller.createWarranty(
    makeReq({
      warrantyType: 'Error de Tipo de Lente (Material)',
      warrantyCase: 'SAME_ORDER',
      newFrameCode: 'M121603',
      newLensCode: 'H000014',
    }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(captured[0].responsibleParty, null);
  assert.equal(captured[0].responsibleSource, null);
});

test('createWarranty: tipo Lente (Caso 2 NEW_ORDER) persiste null/null y nace sin VCA/ticket', async () => {
  const captured = [];
  const controller = loadControllerWithFakePrisma(fakePrismaWithCreateCapture(captured));

  const res = makeRes();
  await controller.createWarranty(
    makeReq({
      warrantyType: 'Error de Tipo de Lente (Material)',
      warrantyCase: 'NEW_ORDER',
      newOrderNumber: '114200002001',
      newFrameCode: '', // Caso 2 no los usa
      newLensCode: '',
    }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(captured[0].responsibleParty, null);
  assert.equal(captured[0].responsibleSource, null);
});
