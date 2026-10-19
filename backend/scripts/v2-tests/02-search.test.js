'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

function parse(cfg) {
  return new URL(cfg.url);
}
function filterOf(cfg) {
  return parse(cfg).searchParams.get('filter');
}

test('search: código de 12 dígitos → filter series==1142;number==1925', async () => {
  const api = h.freshApi();
  const calls = [];
  h.use().setHandler(h.handler(async (cfg) => {
    calls.push(cfg.url);
    if (filterOf(cfg) === 'series==1142;number==1925') {
      return h.envelope([h.listItem({ id: 1, series: '1142', number: 1925 })]);
    }
    return h.envelope([]);
  }));

  const item = await api.getOpticalOrderByNumber('114200001925');
  assert.equal(item.series, '1142');
  assert.equal(item.number, 1925);
  assert.ok(calls[0].includes('series'), 'primera llamada debe filtrar por series');
  assert.ok(!calls.some((u) => decodeURIComponent(u).includes('filter=code==')),
    'REGRESIÓN: nunca debe usar el filtro no soportado code==');
});

test('search: elige el item correcto reconstruyendo series+number', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async (cfg) => {
    if (filterOf(cfg) === 'series==1142;number==1925') {
      return h.envelope([
        h.listItem({ id: 50, series: '9999', number: 1 }),
        h.listItem({ id: 51, series: '1142', number: 1925 }),
      ]);
    }
    return h.envelope([]);
  }));
  const item = await api.getOpticalOrderByNumber('114200001925');
  assert.equal(item.id, 51, 'debe preferir el item cuyo series+number == código');
});

test('search: serie de 1 dígito → filter series==1;number==2012', async () => {
  // Regresión: todas las órdenes de Puente Cristal usan series "1" y su code es
  // '1' + '2012' rellenado a 12 caracteres => '100000002012'. El cliente asumía
  // series de 4 dígitos y descartaba el resultado válido.
  const api = h.freshApi();
  const filters = [];
  h.use().setHandler(h.handler(async (cfg) => {
    const f = filterOf(cfg);
    if (!f) return h.envelope([]);
    filters.push(f);
    if (f === 'series==1;number==2012') {
      return h.envelope([h.listItem({ id: 95686, series: '1', number: 2012 })]);
    }
    return h.envelope([]);
  }));

  const item = await api.getOpticalOrderByNumber('100000002012');
  assert.equal(item.id, 95686, 'debe encontrar la orden con serie corta');
  assert.equal(item.series, '1');
  assert.ok(filters.includes('series==1;number==2012'), 'debe probar la serie corta');
});

test('search: fallback a number directo cuando series/number no trae match', async () => {
  const api = h.freshApi();
  const filters = [];
  h.use().setHandler(h.handler(async (cfg) => {
    const f = filterOf(cfg);
    filters.push(f);
    if (f === 'number==1925') return h.envelope([h.listItem({ id: 7, series: '1142', number: 1925 })]);
    return h.envelope([]);
  }));
  const item = await api.getOpticalOrderByNumber('1925');
  assert.equal(item.id, 7);
  assert.ok(filters.includes('number==1925'), 'debe intentar number==1925');
});

test('search: fallback de barrido paginado acotado (skip 0 → 50)', async () => {
  const api = h.freshApi();
  const urls = [];
  const page1 = Array.from({ length: 50 }, (_, i) => h.listItem({ id: i + 1, series: '9000', number: i + 1 }));
  h.use().setHandler(h.handler(async (cfg) => {
    const u = parse(cfg);
    const f = u.searchParams.get('filter');
    const skip = Number(u.searchParams.get('skip') || 0);
    urls.push(cfg.url);
    if (f) return h.envelope([]);            // series/number y number directo sin match
    if (skip === 0) return h.envelope(page1, { totalCount: 400, hasMore: true });
    if (skip === 50) return h.envelope([h.listItem({ id: 999, series: '1142', number: 1925 })], { totalCount: 400 });
    return h.envelope([]);
  }));

  const item = await api.getOpticalOrderByNumber('114200001925');
  assert.equal(item.id, 999);
  assert.ok(urls.some((u) => u.includes('skip=0')), 'debe barrer desde skip=0');
  assert.ok(urls.some((u) => u.includes('skip=50')), 'debe avanzar a skip=50');
});

test('search: el barrido de respaldo está acotado a un máximo de páginas', async () => {
  const api = h.freshApi();
  let scanPages = 0;
  // Cada página viene llena (50 ítems) pero sin el match: un barrido sin tope
  // seguiría indefinidamente sobre las ~95.000 órdenes reales.
  const fullPage = Array.from({ length: 50 }, (_, i) => h.listItem({ id: i + 1, series: '9000', number: i + 1 }));
  h.use().setHandler(h.handler(async (cfg) => {
    const u = parse(cfg);
    const f = u.searchParams.get('filter');
    if (f) return h.envelope([]);
    if (u.searchParams.has('skip')) scanPages += 1;
    return h.envelope(fullPage, { totalCount: 100000, hasMore: true });
  }));

  await assert.rejects(api.getOpticalOrderByNumber('114200001925'), /No se encontró ninguna orden/);
  assert.ok(scanPages > 0, 'debe intentar el barrido de respaldo');
  assert.ok(scanPages <= 8, `el barrido debe acotarse (se hicieron ${scanPages} páginas)`);
});

test('search: no encontrada → error controlado', async () => {
  const api = h.freshApi();
  h.use().setHandler(h.handler(async () => h.envelope([])));
  await assert.rejects(api.getOpticalOrderByNumber('114200001925'), /No se encontró ninguna orden/);
});
