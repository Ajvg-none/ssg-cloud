'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

test('contrato: estructura exacta de fetchAndMapOrder (regresión)', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');

  assert.deepEqual(Object.keys(res).sort(), h.EXPECTED_ORDER_KEYS,
    'el objeto de salida no debe añadir ni perder claves');
});

test('contrato: tipos de datos requeridos por las capas consumidoras', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');

  assert.equal(typeof res.orden_numero, 'string');
  assert.equal(typeof res.codigo_completo, 'string');
  assert.equal(typeof res.orden_gesvision_id, 'number');
  assert.equal(typeof res.od_esfera, 'number');
  assert.equal(typeof res.oi_esfera, 'number');
  assert.equal(typeof res.tipo_lente, 'string');
  assert.equal(typeof res.cliente_trae_montura, 'boolean');
  assert.ok(Array.isArray(res.items));
  assert.ok(!Number.isNaN(Date.parse(res.fecha_emision_origen)), 'fecha_emision_origen debe ser ISO válida');
});

test('contrato: forma exacta de cada ítem', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');
  for (const item of res.items) {
    assert.deepEqual(Object.keys(item).sort(), h.EXPECTED_ITEM_KEYS, 'claves de ítem inesperadas');
    assert.equal(typeof item.descripcion, 'string');
    assert.equal(typeof item.cantidad, 'number');
    assert.equal(typeof item.es_montura, 'boolean');
    assert.equal(typeof item.es_cristal, 'boolean');
    assert.equal(item.codigo_completo, item.codigo_articulo,
      'el código de v2 ya trae la letra de tipo: codigo_completo no debe prefijarse otra vez');
    if (item.codigo_articulo) {
      assert.ok(!/^([A-Za-z])\1/.test(item.codigo_articulo),
        `letra de tipo duplicada en el código "${item.codigo_articulo}"`);
    }
  }
});

test('contrato: campos financieros con tipos estables', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');

  assert.equal(typeof res.metodo_pago, 'string');
  assert.equal(typeof res.moneda_original, 'string');
  assert.equal(typeof res.exchange_rate, 'number');
  assert.ok(res.monto_total_usd === null || typeof res.monto_total_usd === 'number',
    'monto_total_usd debe ser número o null');
  assert.ok(res.fecha_venta === null || typeof res.fecha_venta === 'string',
    'fecha_venta debe ser string o null');
});

test('contrato: serializable para Prisma Json (round-trip)', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');
  const roundTrip = JSON.parse(JSON.stringify(res));
  assert.deepEqual(roundTrip, res, 'debe sobrevivir el round-trip JSON de la BD');
});
