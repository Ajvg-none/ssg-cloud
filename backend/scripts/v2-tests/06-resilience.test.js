'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { axiosError } = require('./mock');

test('resiliencia: reintenta ante 503 y luego responde OK', async () => {
  const api = h.freshApi();
  let calls = 0;
  h.use().setHandler(h.handler(async () => {
    calls++;
    if (calls === 1) throw axiosError(503, 'ERR_BAD_RESPONSE');
    return h.envelope([h.listItem()]);
  }));
  let res;
  await h.withInstantTimers(async () => { res = await api.listOpticalOrders({ limit: 1 }); });
  assert.ok(Array.isArray(res.data));
  assert.equal(calls, 2);
});

test('resiliencia: 400 no es reintentable (1 sola llamada)', async () => {
  const api = h.freshApi();
  let calls = 0;
  h.use().setHandler(h.handler(async () => {
    calls++;
    throw axiosError(400, null, { detail: 'bad request' });
  }));
  await assert.rejects(api.listOpticalOrders({}), /400/);
  assert.equal(calls, 1, 'un 400 no debe reintentarse');
});

test('resiliencia: timeout (ECONNABORTED) se reintenta y termina en error controlado', async () => {
  const api = h.freshApi();
  let calls = 0;
  h.use().setHandler(h.handler(async () => {
    calls++;
    throw axiosError(null, 'ECONNABORTED');
  }));
  await h.withInstantTimers(async () => {
    await assert.rejects(api.listOpticalOrders({}), /ECONNABORTED/);
  });
  assert.equal(calls, 3, '1 intento + 2 reintentos');
});

test('resiliencia: búsqueda sin resultados → rechazo controlado', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async () => h.envelope([])));
  await assert.rejects(api.getOpticalOrderByNumber('999'), /No se encontró ninguna orden/);
});

test('resiliencia: ID inexistente en fetchAndMapOrder → rechazo controlado', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.handler(async (cfg) => {
    const p = new URL(cfg.url).pathname;
    if (p === '/api/v2/optical-orders') return h.envelope([]);
    if (p.startsWith('/api/v2/optical-orders/')) throw axiosError(404, null, { detail: 'not found' });
    return h.envelope([]);
  }));
  await assert.rejects(fetchAndMapOrder('12345'), /No se pudo encontrar la orden/);
});

test('resiliencia: detalle nulo → rechazo controlado', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.handler(async (cfg) => {
    const p = new URL(cfg.url).pathname;
    if (p === '/api/v2/optical-orders') return h.envelope([h.listItem({ id: 1 })]);
    if (p.startsWith('/api/v2/optical-orders/')) return null;
    return h.envelope([]);
  }));
  await assert.rejects(fetchAndMapOrder('114200001925'), /no encontrada/);
});

test('resiliencia: sin unhandledRejection en rutas de fallo', async () => {
  const { fetchAndMapOrder } = h.freshFetch();
  h.use().setHandler(h.handler(async (cfg) => {
    const p = new URL(cfg.url).pathname;
    if (p === '/api/v2/optical-orders') return h.envelope([]);
    if (p.startsWith('/api/v2/optical-orders/')) throw axiosError(404, null, { detail: 'not found' });
    return h.envelope([]);
  }));

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(fetchAndMapOrder('999'), /No se pudo encontrar/);
    await assert.rejects(fetchAndMapOrder('888'), /No se pudo encontrar/);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off('unhandledRejection', onUnhandled);
  }
  assert.equal(unhandled.length, 0, 'no debe haber promesas rechazadas sin manejar');
});
