'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

/**
 * Construye una factura v2 con las líneas mínimas y los campos financieros dados.
 * @param {Object} fin - Campos financieros (total, currencyCode, exchangeRate…).
 * @returns {Object}
 */
function invoiceWith(fin) {
  return {
    lines: [h.line({ productId: 100, productBarcode: 'M100', productDescription: 'Montura X' })],
    ...fin,
  };
}

test('financiero: usa el totalSystem de GesVision sin convertir', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => invoiceWith({
      total: 76680.52,
      currencyCode: 'VES',
      exchangeRate: 871.3689,
      totalSystem: 88,
      documentDate: '2026-10-05T10:23:00-04:00',
      payments: [
        { paymentMethodName: 'Efectivo' },
        { paymentMethodName: 'Efectivo' },
        { paymentMethodName: 'Tarjeta de Crédito' },
      ],
    }),
  }));

  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.monto_total_usd, 88);
  assert.equal(res.moneda_original, 'VES');
  assert.equal(res.exchange_rate, 871.3689);
  assert.equal(res.metodo_pago, 'Efectivo, Tarjeta de Crédito', 'métodos únicos, sin duplicados');
  assert.equal(res.fecha_venta, '2026-10-05', 'solo la parte YYYY-MM-DD del documentDate');
});

test('financiero: convierte VES → USD con exchangeRate si no hay totalSystem', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => invoiceWith({ total: 8713.689, currencyCode: 'VES', exchangeRate: 871.3689 }),
  }));

  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.monto_total_usd, 10, '8713.689 / 871.3689 redondeado a 2 decimales');
});

test('financiero: moneda USD no se convierte', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => invoiceWith({ total: 55.5, currencyCode: 'USD', exchangeRate: 999 }),
  }));

  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.monto_total_usd, 55.5);
});

test('financiero: sin datos financieros → nulos y valores por defecto', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter());

  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.monto_total_usd, null, 'sin total no hay monto en USD');
  assert.equal(res.moneda_original, 'USD');
  assert.equal(res.exchange_rate, 1);
  assert.equal(res.metodo_pago, 'No especificado');
  assert.equal(res.fecha_venta, null);
});

test('financiero: fecha de venta desde sales-orders cuando la factura no la trae', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.orderRouter({
    invoice: async () => ({ lines: [] }),
    salesOrder: async () => ({
      lines: [h.line({ productBarcode: 'M100', productDescription: 'Montura X' })],
      documentDate: '2026-09-15T08:00:00-04:00',
    }),
  }));

  const res = await fetchAndMapOrder('114200001925');
  assert.equal(res.fecha_venta, '2026-09-15');
});
