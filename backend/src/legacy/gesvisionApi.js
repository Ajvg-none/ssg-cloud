// backend/src/legacy/gesvisionApi.js
// Cliente HTTP de GesVision — API v2 (GESMO). El signin sigue en v1
// (/auth/signin); el JWT HS512 que devuelve es válido para /api/v2/.
const axios = require('axios');
const config = require('../config/gesvision');
const logger = require('../config/logger');

const MAX_NETWORK_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 800;
const RETRY_MAX_DELAY_MS = 5000;

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNREFUSED',
  'ERR_NETWORK',
  'ERR_BAD_RESPONSE'
]);

const RETRYABLE_HTTP_STATUS = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504
]);

// Límites del escaneo paginado de respaldo: acota el barrido para que un código
// inexistente no recorra las ~95.000 órdenes de GesVision (que tardaría minutos).
const SCAN_PAGE_SIZE = 50;
const SCAN_MAX_PAGES = 8;

let authToken = null;
let tokenExpiry = null;
let isAuthenticating = false;
const MAX_AUTH_RETRIES = 2;

/**
 * Obtiene y cachea un token Bearer de GesVision con reintentos controlados.
 * @returns {Promise<string>} Token válido para autenticación.
 */
async function authenticate() {
  if (isAuthenticating) {
    logger.warn('Autenticación en curso, esperando...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (authToken && Date.now() < tokenExpiry) return authToken;
  }
  isAuthenticating = true;
  try {
    for (let attempt = 1; attempt <= MAX_AUTH_RETRIES + 1; attempt++) {
      try {
        logger.info(`🔐 Intentando autenticación en GesVision (intento ${attempt}/${MAX_AUTH_RETRIES + 1})...`);
        const response = await axios.post(`${config.apiUrl}/auth/signin`, {
          username: config.user,
          password: config.password,
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });
        const rawToken = response.data;
        let token = null;
        if (typeof rawToken === 'string') token = rawToken;
        else if (rawToken && typeof rawToken === 'object') token = rawToken.token || rawToken.accessToken || rawToken.jwt;

        if (token) {
          authToken = String(token).replace(/^Bearer\s+/i, '').trim();
          tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutos
          logger.info('✅ Autenticación exitosa en GesVision');
          return authToken;
        }
        throw new Error('Respuesta de autenticación no contiene Bearer token válido');
      } catch (error) {
        const errorDetail = error.response?.data
          ? JSON.stringify(error.response.data)
          : error.code || error.message || 'Error desconocido';
        logger.error(`❌ Error en autenticación GesVision (intento ${attempt}): ${errorDetail}`);
        if (attempt > MAX_AUTH_RETRIES) {
          throw new Error(`No se pudo obtener token de GesVision después de ${MAX_AUTH_RETRIES + 1} intentos: ${errorDetail}`);
        }
        const delay = 2000 * attempt;
        logger.warn(`⏳ Reintentando autenticación en ${delay / 1000} segundos...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    isAuthenticating = false;
  }
}

/**
 * Devuelve el token vigente o fuerza una nueva autenticación si expiró.
 * @returns {Promise<string>} Token Bearer listo para usar.
 */
async function getToken() {
  if (!authToken || Date.now() >= tokenExpiry) {
    await authenticate();
  }
  return authToken;
}

/**
 * Determina si una petición puede reintentarse sin riesgo de duplicar efectos secundarios.
 * @param {Object} error - Error capturado por axios.
 * @param {string} method - Método HTTP original.
 * @returns {boolean}
 */
function isRetryableError(error, method) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (!safeMethods.includes(method.toUpperCase())) {
    return false;
  }
  if (error.code && RETRYABLE_NETWORK_CODES.has(error.code)) {
    return true;
  }
  if (error.response?.status && RETRYABLE_HTTP_STATUS.has(error.response.status)) {
    return true;
  }
  return false;
}

/**
 * Calcula un retraso con jitter para evitar que varios workers reintenten al mismo tiempo.
 * @param {number} attempt - Número de reintento.
 * @returns {number}
 */
function calculateRetryDelay(attempt) {
  const exponentialDelay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delay = exponentialDelay + jitter;
  return Math.min(delay, RETRY_MAX_DELAY_MS);
}

/**
 * Ejecuta una petición HTTP contra la API v2 y aplica recuperación ante fallos transitorios.
 * @param {string} method - Método HTTP.
 * @param {string} endpoint - Ruta relativa de la API v2 (ej: /optical-orders/123).
 * @param {Object|null} data - Cuerpo de la petición.
 * @param {boolean} retried - Indica si ya se reintentó por 401.
 * @param {number} attempt - Número de intento actual.
 * @returns {Promise<*>} response.data
 */
async function request(method, endpoint, data = null, retried = false, attempt = 1) {
  const token = await getToken();
  const url = `${config.apiV2Url}${endpoint}`;
  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 6000
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401 && !retried) {
      logger.warn(`Token expirado en ${method} ${endpoint}, reautenticando...`);
      authToken = null;
      tokenExpiry = null;
      return request(method, endpoint, data, true, attempt);
    }
    if (attempt <= MAX_NETWORK_RETRIES && isRetryableError(error, method)) {
      const delay = calculateRetryDelay(attempt);
      const errorCode = error.code || `HTTP ${error.response?.status}`;
      logger.warn(
        `⚠️ ${errorCode} en ${method} ${endpoint} (intento ${attempt}/${MAX_NETWORK_RETRIES}). ` +
        `Reintentando en ${(delay / 1000).toFixed(1)}s...`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      return request(method, endpoint, data, retried, attempt + 1);
    }
    // El detalle del error de GesVision es un objeto: sin stringify se registraba "[object Object]".
    const errorDetail = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    logger.error(
      `Error en llamada a GesVision v2 ${method} ${endpoint}: ${errorDetail}`
    );
    throw error;
  }
}

/**
 * Extrae el arreglo de resultados de un envelope v2 `{data, totalCount, skip, limit, hasMore}`
 * o de una respuesta tipo arreglo.
 * @param {*} response - response.data de la API v2.
 * @returns {Array<Object>}
 */
function extractData(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.data)) return response.data;
  if (response && Array.isArray(response.items)) return response.items;
  return [];
}

/**
 * Lista órdenes ópticas paginadas (envelope v2).
 * @param {Object} [options]
 * @param {number} [options.skip=0]
 * @param {number} [options.limit=50] - cap 200 en v2.
 * @param {string} [options.filter] - Expresión RSQL.
 * @param {string} [options.sort]
 * @param {string} [options.modifiedAfter]
 * @param {string} [options.modifiedBefore]
 * @returns {Promise<Object>} Envelope `{data,totalCount,skip,limit,hasMore}`.
 */
async function listOpticalOrders(options = {}) {
  const { skip, limit, filter, sort, modifiedAfter, modifiedBefore } = options;
  const params = new URLSearchParams();
  if (skip !== undefined) params.set('skip', skip);
  if (limit !== undefined) params.set('limit', limit);
  if (filter !== undefined) params.set('filter', filter);
  if (sort !== undefined) params.set('sort', sort);
  if (modifiedAfter !== undefined) params.set('modifiedAfter', modifiedAfter);
  if (modifiedBefore !== undefined) params.set('modifiedBefore', modifiedBefore);
  const qs = params.toString();
  return request('GET', `/optical-orders${qs ? `?${qs}` : ''}`);
}

/**
 * Recupera el detalle de una orden óptica (incluye rightEye/leftEye).
 * @param {number|string} orderId - ID interno de la orden óptica.
 * @returns {Promise<Object>} OpticalOrderDocument.
 */
async function getOpticalOrder(orderId) {
  return request('GET', `/optical-orders/${orderId}`);
}

// Longitud total del código compuesto en GesVision v2 (series + number).
// Verificado contra la API real: '1'+2012 -> '100000002012',
// '1092'+2631 -> '109200002631', '1088'+926 -> '108800000926'.
const CODE_TOTAL_LENGTH = 12;

/**
 * Reconstruye el `code` v2 (readOnly, solo presente en el detalle) a partir
 * del `series` + `number` que sí trae cada ítem de lista.
 *
 * ⚠️ La serie NO siempre tiene 4 dígitos (p. ej. todas las órdenes de
 * Puente Cristal usan series "1") y el `number` se rellena con ceros hasta que
 * el código totaliza CODE_TOTAL_LENGTH caracteres.
 * @param {Object} item - Ítem de lista v2.
 * @returns {string|null}
 */
function buildOrderCode(item) {
  if (!item || item.series === undefined || item.series === null || item.number === undefined || item.number === null) {
    return null;
  }
  const series = String(item.series);
  const width = Math.max(0, CODE_TOTAL_LENGTH - series.length);
  return `${series}${String(item.number).padStart(width, '0')}`;
}

/**
 * Recupera una orden óptica buscando por su código/número legible vía RSQL,
 * con una escalera de candidatos y un escaneo paginado de respaldo ACOTADO.
 * Devuelve el ítem de LISTA (cabecera), que no incluye graduación: el detalle
 * se obtiene con `getOpticalOrder(id)`.
 *
 * El campo `code` NO es filtrable en v2 (`FieldDef not found`), pero equivale a
 * `series` + `number` con ceros a la izquierda hasta totalizar 12 caracteres
 * (`buildOrderCode`), por lo que un código de 12 dígitos se descompone para
 * filtrar por `series`+`number`. La serie puede tener 1 a 4 dígitos (Puente
 * Cristal usa "1"), así que se prueban todos los largos posibles.
 *
 * Estrategia (en orden): series/number (largo de serie 4 → 1) → número (último
 * tramo) → número completo → ID interno → serie sola → escaneo paginado
 * (máx. SCAN_MAX_PAGES, reciente-primero). El escaneo acotado evita barridos de
 * minutos sobre las ~95.000 órdenes de GesVision cuando el código no existe o no
 * coincide.
 * @param {string} orderNumber - Número/código de orden (ej: 113200000336).
 * @returns {Promise<Object>}
 */
async function getOpticalOrderByNumber(orderNumber) {
  const value = String(orderNumber).trim();
  const isNumeric = /^\d+$/.test(value);

  // Un ítem de lista coincide si su code reconstruido (series+number) o su number
  // equivalen al valor buscado.
  const matches = (o) =>
    buildOrderCode(o) === value ||
    String(o?.number) === value ||
    String(o?.code) === value;

  // Busca por filtro RSQL con orden reciente-primero y valida con `matches`.
  const searchByFilter = async (filter) => {
    const response = await listOpticalOrders({ limit: SCAN_PAGE_SIZE, filter, sort: 'lastModifiedAt:desc' });
    return extractData(response).filter(matches);
  };

  try {
    let candidates = [];

    // 1. Código compuesto → descomponer en series + number.
    //    La serie NO siempre tiene 4 dígitos (p. ej. Puente Cristal usa "1") y el
    //    `code` totaliza 12 caracteres (series + number con ceros a la izquierda),
    //    por lo que se prueban todos los largos de serie posibles (4 → 1).
    if (isNumeric && value.length > 4) {
      const maxSeriesLen = Math.min(4, value.length - 1);
      for (let len = maxSeriesLen; len >= 1 && candidates.length === 0; len--) {
        const series = value.slice(0, len);
        const number = parseInt(value.slice(len), 10);
        try {
          logger.info(`Buscando orden por series/number en GesVision v2: ${series}/${number}`);
          candidates = await searchByFilter(`series==${series};number==${number}`);
        } catch (err) {
          logger.warn(`⚠️ Error en la búsqueda por series/number (${series}/${number}): ${err.message}`);
        }
      }
    }

    // 2. Número (último tramo del código) — clave cuando el paso 1 no encuentra.
    if (!candidates.length && isNumeric) {
      const number = parseInt(value.length > 4 ? value.slice(4) : value, 10);
      try {
        logger.info(`Buscando orden por número (tramo) en GesVision v2: ${number}`);
        candidates = await searchByFilter(`number==${number}`);
      } catch (err) {
        logger.warn(`⚠️ Error en la búsqueda por número (tramo): ${err.message}`);
      }
    }

    // 3. Número con el valor completo (formato legado)
    if (!candidates.length && isNumeric) {
      try {
        logger.info(`Buscando orden por número completo en GesVision v2: ${value}`);
        candidates = await searchByFilter(`number==${value}`);
      } catch (err) {
        logger.warn(`⚠️ Error en la búsqueda por número completo: ${err.message}`);
      }
    }

    // 4. Por ID interno de la orden óptica (solo identificadores largos:
    //    los IDs internos son de 5+ dígitos y evita confundir un número corto).
    if (!candidates.length && isNumeric && value.length > 4) {
      try {
        logger.info(`Buscando orden por ID interno en GesVision v2: ${value}`);
        const detail = await getOpticalOrder(parseInt(value, 10));
        if (detail && detail.id) candidates = [detail];
      } catch (err) {
        logger.warn(`⚠️ Error en la búsqueda por ID interno: ${err.message}`);
      }
    }

    // 5. Serie sola
    if (!candidates.length && isNumeric) {
      try {
        logger.info(`Buscando orden por serie en GesVision v2: ${value}`);
        candidates = await searchByFilter(`series==${value}`);
      } catch (err) {
        logger.warn(`⚠️ Error en la búsqueda por serie: ${err.message}`);
      }
    }

    // 6. Escaneo paginado de respaldo: ACOTADO y reciente-primero.
    //    Antes era `while (true)` sobre ~95.000 órdenes sin orden → minutos de espera.
    if (!candidates.length) {
      logger.info(`⚡ Iniciando escaneo paginado (máx. ${SCAN_MAX_PAGES} páginas) en GesVision v2 para: ${value}...`);
      let skip = 0;
      for (let page = 0; page < SCAN_MAX_PAGES; page++) {
        let orders = [];
        try {
          const response = await listOpticalOrders({ skip, limit: SCAN_PAGE_SIZE, sort: 'lastModifiedAt:desc' });
          orders = extractData(response);
        } catch (err) {
          logger.warn(`⚠️ Error en escaneo paginado (skip=${skip}): ${err.message}`);
          break;
        }
        if (!orders || orders.length === 0) break;
        const hit = orders.find(matches);
        if (hit) {
          candidates = [hit];
          logger.info(`⚡ Encontrado en escaneo paginado: ID ${hit.id}`);
          break;
        }
        if (orders.length < SCAN_PAGE_SIZE) break;
        skip += SCAN_PAGE_SIZE;
      }
    }

    if (candidates.length) return candidates[0];
    throw new Error(`No se encontró ninguna orden con el número o código exacto: ${orderNumber}`);
  } catch (error) {
    logger.error(`❌ Error buscando orden por número/código ${orderNumber}: ${error.message}`);
    throw error;
  }
}

/**
 * Busca productos por su referencia/código mostrado en las ventas v2
 * (ej: 'M121603', 'H000014'). El campo FILTRABLE en v2 es `reference`:
 * `barCode` y `code` responden 400 "FieldDef not found". La referencia en BD
 * puede venir con espacios de relleno ('H000014       '), por eso el filtro
 * matchea igual y el resultado se devuelve recortado.
 * @param {string} code - Código de artículo (barCode mostrado en la venta).
 * @returns {Promise<Object|null>} { id, reference, description } | null si no existe.
 */
const productByReferenceCache = new Map();

async function searchProductByReference(code) {
  const value = String(code || '').trim();
  if (!value) return null;
  if (productByReferenceCache.has(value)) return productByReferenceCache.get(value);

  const filter = `reference=="${value}"`;
  const response = await request('GET', `/products?filter=${encodeURIComponent(filter)}&limit=10`);
  const items = extractData(response);
  const hit = items.find((p) => String(p?.reference || '').trim() === value) || items[0] || null;

  const result = hit
    ? {
        id: hit.id,
        reference: String(hit.reference || '').trim(),
        description: hit.description || hit.name || hit.extendedDescription || null,
      }
    : null;
  productByReferenceCache.set(value, result);
  logger.info(`🔍 Productos por referencia ${value}: ${items.length} resultado(s)`);
  return result;
}

/**
 * Obtiene una factura de venta v2 (incluye `lines`). Permiso VER_FACTURASEMITIDAS.
 * @param {number|string} invoiceId - Identificador externo.
 * @returns {Promise<Object>} InvoiceDocument.
 */
async function getSalesInvoice(invoiceId) {
  return request('GET', `/sales-invoices/${invoiceId}`);
}

/**
 * Obtiene el pedido de venta v2 asociado (incluye `lines`). Fallback de items.
 * @param {number|string} orderId - Identificador externo.
 * @returns {Promise<Object>} SalesOrderDocument.
 */
async function getSalesOrder(orderId) {
  return request('GET', `/sales-orders/${orderId}`);
}

/**
 * Recupera el catálogo de productos para enriquecer la sincronización local.
 * @param {number|string} productId - Identificador externo.
 * @returns {Promise<Object>} ProductDocument.
 */
async function getProduct(productId) {
  return request('GET', `/products/${productId}`);
}

/**
 * Obtiene el detalle de un cliente (para extraer su nombre completo).
 * @param {number|string} customerId - Identificador del cliente.
 * @returns {Promise<Object>} CustomerDocument.
 */
async function getCustomer(customerId) {
  return request('GET', `/customers/${customerId}`);
}

/**
 * Obtiene un usuario de back-office v2 (disponibilidad: v2 no expone empleados).
 * @param {number|string} userId - Identificador del usuario.
 * @returns {Promise<Object>}
 */
async function getUser(userId) {
  return request('GET', `/users/${userId}`);
}

module.exports = {
  authenticate,
  getToken,
  request,
  extractData,
  listOpticalOrders,
  getOpticalOrder,
  getOpticalOrderByNumber,
  getSalesInvoice,
  getSalesOrder,
  getProduct,
  searchProductByReference,
  getCustomer,
  getUser
};
