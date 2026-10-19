'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { axiosError } = require('./mock');

test('token: signin devuelve string "Bearer x" → x', async () => {
  const api = h.freshApi();
  h.use().setHandler(async (cfg) => {
    assert.ok(cfg.url.endsWith('/auth/signin'), 'debe llamar al signin v1');
    return 'Bearer abc123';
  });
  assert.equal(await api.getToken(), 'abc123');
});

test('token: signin devuelve objeto {token|accessToken|jwt}', async () => {
  for (const body of [{ token: 'tok-t' }, { accessToken: 'tok-a' }, { jwt: 'tok-j' }]) {
    const api = h.freshApi();
    h.use().setHandler(async () => body);
    const expected = body.token || body.accessToken || body.jwt;
    assert.equal(await api.getToken(), expected);
  }
});

test('token: se cachea (2 getToken → 1 POST)', async () => {
  const api = h.freshApi();
  let posts = 0;
  h.use().setHandler(async () => { posts++; return 'Bearer cached'; });
  assert.equal(await api.getToken(), 'cached');
  assert.equal(await api.getToken(), 'cached');
  assert.equal(posts, 1);
});

test('token: expira a los 55 min → re-autentica', async () => {
  const api = h.freshApi();
  let posts = 0;
  h.use().setHandler(async () => { posts++; return 'Bearer tok'; });
  assert.equal(await api.getToken(), 'tok');
  assert.equal(posts, 1);

  const realNow = Date.now;
  Date.now = () => realNow() + 56 * 60 * 1000;
  try {
    assert.equal(await api.getToken(), 'tok');
  } finally {
    Date.now = realNow;
  }
  assert.equal(posts, 2, 'debe reautenticar tras expirar');
});

test('token: auth concurrente comparte una sola petición', async () => {
  const api = h.freshApi();
  let posts = 0;
  h.use().setHandler(async () => { posts++; return 'Bearer conc'; });
  const [a, b] = await Promise.all([api.getToken(), api.getToken()]);
  assert.equal(a, 'conc');
  assert.equal(b, 'conc');
  assert.equal(posts, 1);
});

test('token: reintenta con backoff ante ECONNRESET y luego tiene éxito', async () => {
  const api = h.freshApi();
  let calls = 0;
  h.use().setHandler(async () => {
    calls++;
    if (calls === 1) throw axiosError(null, 'ECONNRESET');
    return 'Bearer retry-ok';
  });
  let token;
  await h.withInstantTimers(async () => { token = await api.getToken(); });
  assert.equal(token, 'retry-ok');
  assert.equal(calls, 2);
});

test('token: falla de forma controlada tras 3 intentos', async () => {
  const api = h.freshApi();
  let calls = 0;
  h.use().setHandler(async () => { calls++; throw axiosError(500, 'ERR_BAD_RESPONSE'); });
  await h.withInstantTimers(async () => {
    await assert.rejects(api.getToken(), /No se pudo obtener token de GesVision/);
  });
  assert.equal(calls, 3);
});

test('token: respuesta sin token válido → error controlado', async () => {
  const api = h.freshApi();
  h.use().setHandler(async () => ({ foo: 'bar' }));
  await h.withInstantTimers(async () => {
    await assert.rejects(api.getToken(), /Bearer token válido/);
  });
});
