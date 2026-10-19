'use strict';
//
// Fake axios para unit tests offline. Inyecta un módulo axios falso en el
// require.cache para que `gesvisionApi.js` lo consuma sin tocar la red ni el
// código de producción. Soporta las dos formas que usa el cliente:
//   - axios(config)                 (petición genérica)
//   - axios.post(url, data, opts)   (signin)
//
const AXIOS_PATH = require.resolve('axios');

/**
 * Construye un error con la forma que axios produce y que el cliente espera
 * (error.response.status, error.code, error.config).
 * @param {number|null} status - Código HTTP (null para errores de red).
 * @param {string} [code] - Código de error de red (p. ej. ECONNABORTED).
 * @param {*} [data] - Cuerpo de la respuesta de error.
 * @returns {Error}
 */
function axiosError(status, code, data) {
  const err = new Error(status ? `Request failed with status code ${status}` : (code || 'Network Error'));
  if (code) err.code = code;
  if (status) err.response = { status, data: data === undefined ? {} : data };
  err.config = {};
  return err;
}

/**
 * Crea una instancia de axios falso con historial de llamadas y handler
 * configurable.
 * @returns {Object}
 */
function createMock() {
  const calls = [];
  let handler = null;

  async function fakeAxios(config) {
    const cfg = {
      method: String((config && config.method) || 'get').toUpperCase(),
      url: config && config.url,
      headers: (config && config.headers) || {},
      data: config && config.data,
      timeout: config && config.timeout,
    };
    calls.push(cfg);
    if (typeof handler !== 'function') {
      throw new Error(`mock axios: sin handler para ${cfg.method} ${cfg.url}`);
    }
    // El handler devuelve el PAYLOAD; axios real resuelve con { data: payload }.
    const payload = await handler(cfg);
    return { data: payload, status: 200, headers: {}, config: cfg };
  }

  fakeAxios.post = (url, data, opts) => {
    return fakeAxios({
      method: 'post',
      url,
      data,
      headers: opts && opts.headers,
      timeout: opts && opts.timeout,
    });
  };

  return {
    axios: fakeAxios,
    calls,
    /** @param {(cfg:Object)=>Promise<{data:*}>} fn */
    setHandler(fn) { handler = fn; },
    reset() { calls.length = 0; handler = null; },
  };
}

let current = null;

/**
 * Instala un axios falso en el require.cache y lo devuelve.
 * Debe llamarse ANTES de requerir `gesvisionApi.js` (fresco).
 * @returns {Object}
 */
function install() {
  current = createMock();
  require.cache[AXIOS_PATH] = {
    id: AXIOS_PATH,
    filename: AXIOS_PATH,
    loaded: true,
    exports: current.axios,
  };
  return current;
}

/** @returns {Object|null} */
function getMock() { return current; }

module.exports = { install, getMock, createMock, axiosError, AXIOS_PATH };
