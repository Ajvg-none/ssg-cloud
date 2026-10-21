'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const CreateWarrantyUseCase = require('../../src/application/warranty/CreateWarrantyUseCase');
const VcaOutboxWorker = require('../../src/infrastructure/outbox/VcaOutboxWorker');
const { ValidationError } = require('../../src/domain/errors');

const logger = { info() {}, warn() {}, error() {} };

const baseStore = { id: 'store-1', labId: 'lab-1', accn: '001', name: 'Tienda Test' };

function makeUseCase(overrides = {}) {
  const calls = { outbox: 0, paid: null, revision: null };
  const warrantyRepo = {
    async createNewPaidOrder(data) {
      calls.paid = data;
      return { id: 'w-paid', orderNumber: data.orderNumber, revision: 1, ...data };
    },
    async createWithNextRevision(args, enqueue) {
      calls.revision = args;
      const created = {
        id: 'w-reg',
        orderNumber: 'ORD-1-1',
        revision: 1,
        requiresVca: args.data.requiresVca,
        requiresTicket: args.data.requiresTicket,
        category: args.data.category,
      };
      if (enqueue) await enqueue({}, created);
      return created;
    },
    ...overrides.warrantyRepo,
  };
  const storeRepo = { async findById() { return baseStore; }, ...overrides.storeRepo };
  const productCatalog = {
    async getByCode() { return { description: 'Producto' }; },
    ...overrides.productCatalog,
  };
  const outbox = {
    async enqueue() { calls.outbox += 1; },
    ...overrides.outbox,
  };

  return {
    useCase: new CreateWarrantyUseCase({ warrantyRepo, storeRepo, productCatalog, outbox, logger }),
    calls,
  };
}

test('NEW_ORDER: crea orden pagada sin VCA ni outbox', async () => {
  const { useCase, calls } = makeUseCase();

  const created = await useCase.execute(
    {
      orderNumber: 'OLD-1',
      orderData: { orden_numero: 'OLD-1', codigo_completo: 'OLD-1' },
      warrantyType: 'Error de Tipo de Lente (Material)',
      warrantyCase: 'NEW_ORDER',
      newOrderNumber: 'NEW-1',
    },
    { storeId: 'store-1' }
  );

  assert.equal(created.id, 'w-paid');
  assert.equal(calls.paid.requiresVca, false);
  assert.equal(calls.paid.requiresTicket, false);
  assert.equal(calls.paid.status, 'COMPLETED');
  assert.equal(calls.outbox, 0);
});

test('flujo normal: crea revisión y encola VCA en el outbox', async () => {
  const { useCase, calls } = makeUseCase();

  const created = await useCase.execute(
    {
      orderNumber: 'ORD-1',
      orderData: { orden_numero: 'ORD-1', codigo_completo: 'ORD-1' },
      warrantyType: 'Error de Medida',
      category: 'TIENDA',
    },
    { storeId: 'store-1' }
  );

  assert.equal(created.id, 'w-reg');
  assert.equal(calls.revision.data.status, 'PENDING');
  assert.equal(calls.revision.data.requiresVca, true);
  assert.equal(calls.outbox, 1);
});

test('rechaza ACCN inválido con el mensaje existente', async () => {
  const { useCase } = makeUseCase({
    storeRepo: { async findById() { return { ...baseStore, accn: '12' }; } },
  });

  await assert.rejects(
    () => useCase.execute(
      {
        orderNumber: 'ORD-1',
        orderData: { orden_numero: 'ORD-1' },
        warrantyType: 'Error de Medida',
      },
      { storeId: 'store-1' }
    ),
    (err) => err instanceof ValidationError &&
      err.message.includes('ACCN de 3 dígitos')
  );
});

test('rechaza categoría inválida con el mensaje existente', async () => {
  const { useCase } = makeUseCase();

  await assert.rejects(
    () => useCase.execute(
      {
        orderNumber: 'ORD-1',
        orderData: { orden_numero: 'ORD-1' },
        warrantyType: 'Error de Medida',
        category: 'PROVEEDOR',
      },
      { storeId: 'store-1' }
    ),
    (err) => err instanceof ValidationError &&
      err.message === 'Categoría de garantía inválida. Valores válidos: TIENDA, LABORATORIO.'
  );
});

function makeWorker(overrides = {}) {
  const events = [];
  const outboxRepo = {
    async recoverStaleProcessing() {},
    async backfillFromPendingWarranties() { return 0; },
    async claimDue() { return [{ id: 'job-1', warrantyId: 'w-1', attempts: 0 }]; },
    async markDone(id) { events.push(['done', id]); },
    async markRetry(id, attempts, message) { events.push(['retry', id, attempts, message]); },
    async markFailed(id, attempts, message) { events.push(['failed', id, attempts, message]); },
    ...overrides.outboxRepo,
  };
  const warrantyRepo = {
    async findWithRelationsById() {
      return {
        id: 'w-1',
        orderNumber: 'ORD-1',
        requiresVca: true,
        store: { name: 'Tienda' },
        lab: { vcaEnabled: true, vcaNetworkPath: '\\\\nas\\vca' },
      };
    },
    ...overrides.warrantyRepo,
  };
  const vcaDelivery = {
    async deliver() { return { delivered: true }; },
    ...overrides.vcaDelivery,
  };
  return {
    worker: new VcaOutboxWorker({ outboxRepo, warrantyRepo, vcaDelivery, batchSize: 10, maxAttempts: 3 }),
    events,
  };
}

test('outbox worker: entrega OK marca DONE', async () => {
  const { worker, events } = makeWorker();
  const stats = await worker.runOnce();
  assert.equal(stats.claimed, 1);
  assert.equal(stats.delivered, 1);
  assert.deepEqual(events, [['done', 'job-1']]);
});

test('outbox worker: fallo reintenta mientras no supere maxAttempts', async () => {
  const { worker, events } = makeWorker({
    vcaDelivery: { async deliver() { return { delivered: false, error: 'fs error' }; } },
  });
  const stats = await worker.runOnce();
  assert.equal(stats.retried, 1);
  assert.deepEqual(events, [['retry', 'job-1', 1, 'fs error']]);
});
