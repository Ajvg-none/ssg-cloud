'use strict';

// Requerimiento de la directiva para la categoría LABORATORIO:
// cualquiera de los 3 tipos ('Material no Solicitado', 'Formula no solicitada',
// 'Material Dañado') NO genera VCA ni ticket, PERO SÍ genera la Orden A4
// (impresa por la tienda) y la garantía NACE COMPLETED.

const test = require('node:test');
const assert = require('node:assert/strict');

const CreateWarrantyUseCase = require('../../src/application/warranty/CreateWarrantyUseCase');
const { ValidationError } = require('../../src/domain/errors');

const logger = { info() {}, warn() {}, error() {} };

const baseStore = { id: 'store-1', labId: 'lab-1', accn: '001', name: 'Tienda Test' };
const orderInput = (type) => ({
  orderNumber: 'ORD-1',
  orderData: { orden_numero: 'ORD-1', codigo_completo: 'ORD-1', items: [] },
  warrantyType: type,
  category: 'LABORATORIO',
});

function makeUseCase(overrides = {}) {
  const calls = { outbox: 0, revision: null };
  const warrantyRepo = {
    async createWithNextRevision(args, enqueue) {
      calls.revision = args;
      calls.enqueue = enqueue;
      return {
        id: 'w-lab',
        orderNumber: 'ORD-1-1',
        revision: 1,
        ...args.data,
      };
    },
    ...overrides.warrantyRepo,
  };
  return {
    useCase: new CreateWarrantyUseCase({
      warrantyRepo,
      storeRepo: { async findById() { return baseStore; } },
      productCatalog: { async getByCode() { return { description: 'Producto' }; } },
      outbox: {
        async enqueue() { calls.outbox += 1; },
      },
      logger,
    }),
    calls,
  };
}

test('LABORATORIO: Material no Solicitado nace COMPLETED sin outbox', async () => {
  const { useCase, calls } = makeUseCase();

  const created = await useCase.execute(orderInput('Material no Solicitado'), { storeId: 'store-1' });

  assert.equal(calls.revision.data.status, 'COMPLETED', 'nace COMPLETED (sin nada que entregar)');
  assert.ok(calls.revision.data.processedAt, 'queda processedAt al instante de crear');
  assert.equal(calls.revision.data.requiresVca, false, 'LABORATORIO no entrega VCA');
  assert.equal(calls.revision.data.requiresTicket, false, 'LABORATORIO no imprime ticket');
  assert.equal(calls.revision.data.category, 'LABORATORIO');
  assert.equal(calls.enqueue, null, 'nunca encola outbox');
  assert.equal(calls.outbox, 0);
});

test('LABORATORIO: Formula no solicitada y Material Dañado — mismo trato', async () => {
  for (const type of ['Formula no solicitada', 'Material Dañado']) {
    const { useCase, calls } = makeUseCase();
    const created = await useCase.execute(orderInput(type), { storeId: 'store-1' });
    assert.equal(calls.revision.data.status, 'COMPLETED', `${type} nace COMPLETED`);
    assert.equal(created.requiresVca, false);
    assert.equal(created.requiresTicket, false);
    assert.equal(calls.outbox, 0, `${type} tampoco toca el outbox`);
  }
});

test('LABORATORIO: mantiene el número de revisión clásico (no abre OT nueva)', async () => {
  const { useCase, calls } = makeUseCase();
  await useCase.execute(orderInput('Material Dañado'), { storeId: 'store-1' });
  // La numeración la computa el repo; acá solo verificamos que NO va por la
  // rama de nueva OT pagada (orderNumber que llega igual al input).
  assert.equal(calls.revision.orderNumber, 'ORD-1');
});

test('TIENDA (regresión): flujo clásico sigue naciendo PENDING con VCA', async () => {
  const { useCase, calls } = makeUseCase();
  await useCase.execute(
    { ...orderInput('Error de Medida'), category: 'TIENDA' },
    { storeId: 'store-1' }
  );
  assert.equal(calls.revision.data.status, 'PENDING');
  assert.equal(calls.revision.data.requiresVca, true);
  assert.equal(calls.revision.data.requiresTicket, true);
  assert.ok(calls.enqueue, 'encola outbox sí o sí');
});

test('LABORATORIO: sin categoría explícita NO aplica política LAB (regresión)', async () => {
  // El frontend manda SIEMPRE category; un cliente viejo que la omite cae en
  // TIENDA por defecto: su garantía NACE PENDING y SÍ entrega VCA.
  const { useCase, calls } = makeUseCase();
  const created = await useCase.execute(
    {
      orderNumber: 'ORD-1',
      orderData: { orden_numero: 'ORD-1', codigo_completo: 'ORD-1', items: [] },
      warrantyType: 'Material no Solicitado',
      // category ausente → TIENDA (compatibilidad)
    },
    { storeId: 'store-1' }
  );
  assert.equal(created.category, 'TIENDA');
  assert.equal(calls.revision.data.status, 'PENDING');
  assert.equal(calls.revision.data.requiresVca, true);
});
