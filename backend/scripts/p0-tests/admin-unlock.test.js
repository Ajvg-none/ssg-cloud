'use strict';

// Regla del desbloqueo admin: SOLO garantías COMPLETED o ERROR que generen
// VCA + ticket (TIENDA clásica). El resto responde 400 sin tocar la BD:
//   - LABORATORIO / nueva OT pagada  → 400 "no genera VCA ni ticket"
//   - PENDING / PROCESSING           → 400 por estado

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '../../src/controllers/adminController.js');
const CONTAINER_PATH = path.resolve(__dirname, '../../src/container.js');

function loadControllerWithFakeContainer(containerFake) {
  require.cache[CONTAINER_PATH] = {
    id: CONTAINER_PATH,
    filename: CONTAINER_PATH,
    loaded: true,
    exports: containerFake,
  };
  delete require.cache[CONTROLLER_PATH];
  return require('../../src/controllers/adminController.js');
}

function makeRes() {
  const res = { statusCode: 0, payload: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.payload = payload; return res; };
  return res;
}

function buildHarness(warrantyRow) {
  const calls = { resetReprocess: 0, outboxReset: 0, markDone: 0, deliver: 0 };
  const fakeContainer = {
    repositories: {
      warrantyRepo: {
        async findWithRelationsById() { return warrantyRow; },
        async resetForReprocess() {
          calls.resetReprocess += 1;
          return { id: warrantyRow.id };
        },
      },
      outboxRepo: {
        async resetForWarranty() {
          calls.outboxReset += 1;
          return { id: 'outbox-1' };
        },
        async markDone() {
          calls.markDone += 1;
          return {};
        },
      },
    },
    adapters: {
      vcaDelivery: {
        async deliver() {
          calls.deliver += 1;
          return { delivered: true };
        },
      },
    },
    useCases: {},
  };
  return { calls, ...loadControllerWithFakeContainer(fakeContainer) };
}

const baseWarranty = (over = {}) => ({
  id: 'w1',
  orderNumber: '100000002065-1',
  status: 'COMPLETED',
  requiresVca: true,
  requiresTicket: true,
  store: { id: 's1', name: 'Tienda', accn: '001' },
  lab: { id: 'l1', name: 'Lab', vcaEnabled: true, vcaNetworkPath: '\\\\lab\\vca' },
  ...over,
});

test('unlock: COMPLETED con VCA+ticket → 200, reset + outbox DONE + entrega', async () => {
  const { calls, ...controller } = buildHarness(baseWarranty());
  const controllerUnlock = controller.unlockWarranty;

  const res = makeRes();
  await controllerUnlock({ params: { id: 'w1' } }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.equal(calls.resetReprocess, 1);
  assert.equal(calls.outboxReset, 1);
  assert.equal(calls.deliver, 1, 'entrega inmediata del VCA');
  assert.equal(calls.markDone, 1);
});

test('unlock: ERROR con VCA+ticket → mismo camino de rescate', async () => {
  const { calls, ...controller } = buildHarness(baseWarranty({ status: 'ERROR' }));
  const res = makeRes();
  await controller.unlockWarranty({ params: { id: 'w1' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.resetReprocess, 1);
  assert.equal(calls.deliver, 1);
});

test('unlock: LABORATORIO (no genera VCA/ticket) → 400 y nada se toca', async () => {
  const { calls, ...controller } = buildHarness(
    baseWarranty({
      category: 'LABORATORIO',
      status: 'COMPLETED',
      requiresVca: false,
      requiresTicket: false,
    })
  );
  const res = makeRes();
  await controller.unlockWarranty({ params: { id: 'w1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'Esta garantía no genera VCA ni ticket; no requiere reproceso.');
  assert.equal(calls.resetReprocess, 0, 'la BD queda intacta');
  assert.equal(calls.deliver, 0);
});

test('unlock: PENDING → 400 por estado, ni el repo se toca', async () => {
  const { calls, ...controller } = buildHarness(baseWarranty({ status: 'PENDING' }));
  const res = makeRes();
  await controller.unlockWarranty({ params: { id: 'w1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /completadas o con error/i);
  assert.equal(calls.resetReprocess, 0);
  assert.equal(calls.deliver, 0);
});

test('unlock: nueva OT pagada (NEW_ORDER, false/false) → 400 sin reproceso', async () => {
  const { calls, ...controller } = buildHarness(
    baseWarranty({ warrantyCase: 'NEW_ORDER', requiresVca: false, requiresTicket: false })
  );
  const res = makeRes();
  await controller.unlockWarranty({ params: { id: 'w1' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(calls.resetReprocess, 0);
});

test('unlock: garantía inexistente → 404', async () => {
  const { ...controller } = buildHarness(null);
  const res = makeRes();
  await controller.unlockWarranty({ params: { id: 'missing' } }, res);

  assert.equal(res.statusCode, 404);
});
