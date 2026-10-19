'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { axiosError } = require('./mock');

test('items: usa sales-invoices y NO llama a sales-orders', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter());
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].prefijo, 'M');
  assert.equal(res.items[0].es_montura, true);
  assert.ok(!m.calls.some((c) => c.url.includes('/sales-orders/')),
    'no debe consultar sales-orders si la factura tiene líneas');
});

test('items: fallback a sales-orders cuando la factura viene vacía', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter({
    invoice: async () => ({ lines: [] }),
    salesOrder: async () => ({ lines: [h.line({ productId: 200 })] }),
    product: async () => ({ reference: 'C55', description: 'Cristal' }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items.length, 1);
  assert.ok(m.calls.some((c) => c.url.includes('/sales-orders/666')), 'debe usar sales-orders como fallback');
});

test('items: fallback a sales-orders cuando la factura da error', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => { throw axiosError(404, null, { detail: 'not found' }); },
    salesOrder: async () => ({ lines: [h.line({ productId: 200 })] }),
    product: async () => ({ reference: 'M200', description: 'Montura' }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items.length, 1);
});

test('items: factura y pedido vacíos → items=[] sin romper', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => ({ lines: [] }),
    salesOrder: async () => ({ lines: [] }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.deepEqual(res.items, []);
});

test('items: producto 404 → descripción por defecto, sin romper', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({ productId: 999 })] }),
    product: async () => { throw axiosError(404, null, { detail: 'product not found' }); },
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].descripcion, 'Descripción no disponible');
  assert.equal(res.items[0].codigo_articulo, null);
  assert.equal(res.items[0].es_montura, false);
});

test('items: clasificación por letra del código (fallback sin opticalRole)', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({ productId: 100 })] }),
    product: async () => ({ reference: 'C55', description: 'Cristal Progresivo' }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items[0].es_cristal, true);
  assert.equal(res.items[0].prefijo, 'C', 'prefijo = primera letra del código');
  assert.equal(res.items[0].codigo_completo, 'C55', 'no debe duplicar la letra de tipo');
});

test('items: clasifica por descripción cuando no hay barcode ni catálogo', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({ productId: null, productDescription: 'Montura Ray-Ban' })] }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items[0].es_montura, true);
  assert.equal(res.items[0].prefijo, '', 'sin código no hay letra de tipo');
  assert.ok(!m.calls.some((c) => c.url.includes('/products/')));
});

test('items: usa productBarcode de la línea, no el reference del catálogo', async () => {
  // Regresión: para la montura MM2091 el catálogo devolvía "S025624" mientras
  // GesVision muestra "M121603". El barcode de la línea es la fuente correcta.
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({
      productId: 147017,
      productBarcode: 'M121603',
      productDescription: 'MM2091 145 C1 NEGRA',
      opticalRole: 'FRAME',
    })] }),
    product: async () => { throw new Error('no debe consultar el catálogo si la línea trae barcode'); },
  }));
  const res = await fetchAndMapOrder('100000001933');
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].codigo_articulo, 'M121603');
  assert.equal(res.items[0].codigo_completo, 'M121603');
  assert.equal(res.items[0].es_montura, true);
  assert.equal(res.items[0].prefijo, 'M');
  assert.ok(!m.calls.some((c) => c.url.includes('/products/')), 'no debe consultar /products/');
});

test('items: no duplica la letra de tipo (estuche)', async () => {
  // Regresión: el estuche viene como "E000063"; antes se clasificaba como montura
  // por el reference del catálogo ("M113488") y se duplicaba la letra ("MM113488").
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({
      productId: 1980,
      productBarcode: 'E000063',
      productDescription: 'ESTUCHES OPTICOLOR',
    })] }),
    product: async () => ({ reference: 'M113488', description: 'GK2502-C6' }),
  }));
  const res = await fetchAndMapOrder('100000001933');
  assert.equal(res.items[0].codigo_articulo, 'E000063');
  assert.equal(res.items[0].codigo_completo, 'E000063', 'el código ya trae la letra: no se prefija de nuevo');
  assert.equal(res.items[0].es_montura, false, 'un estuche no es montura');
  assert.equal(res.items[0].prefijo, 'E');
});

test('items: regresión con la orden real 100000001933', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter({
    invoice: async () => ({ lines: h.goldenLines100000001933() }),
    product: async () => { throw new Error('no debe consultar el catálogo'); },
  }));
  const res = await fetchAndMapOrder('100000001933');
  assert.deepEqual(res.items.map((i) => i.codigo_articulo), ['M121603', 'H000014', 'H000014', 'E000063']);
  assert.deepEqual(res.items.map((i) => i.es_montura), [true, false, false, false]);
  assert.deepEqual(res.items.map((i) => i.es_cristal), [false, true, true, false]);
  assert.ok(res.items.every((i) => i.codigo_completo === i.codigo_articulo));
  assert.ok(!m.calls.some((c) => c.url.includes('/products/')), 'todas las líneas traen barcode: no toca el catálogo');
});

test('items: productCache evita repetir getProduct (mismo producto)', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  const m = h.use();
  m.setHandler(h.orderRouter({
    invoice: async () => ({ lines: [h.line({ productId: 100 }), h.line({ productId: 100 })] }),
    product: async () => ({ reference: 'M100', description: 'Montura' }),
  }));
  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.items.length, 2);
  const productCalls = m.calls.filter((c) => c.url.includes('/products/'));
  assert.equal(productCalls.length, 1, 'debe cachear el producto');
});
