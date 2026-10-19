// backend/src/services/vcaService.js
// Entrega local del archivo VCA (fs) — reemplaza el polling del agente externo.
// Corre fuera de la transacción de la garantía: un fallo de escritura nunca la afecta.
const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');
const prisma = require('../config/prisma');
const { generateVCAContent } = require('../legacy/lensware');

const WRITE_TIMEOUT_MS = parseInt(process.env.VCA_WRITE_TIMEOUT_MS, 10) || 10000;
const MAX_ATTEMPTS = parseInt(process.env.VCA_MAX_ATTEMPTS, 10) || 5;
const CUTOFF_KEY = 'vca_local_since';
// Caché del corte persistente leído de app_settings (evita una query por ciclo).
let cutoffCache = null;

/**
 * Corte de entrega VCA: persistente en BD para sobrevivir a reinicios del proceso.
 * `VCA_LOCAL_SINCE` (ISO) lo sobrescribe manualmente; si no, se crea una sola vez
 * la fila app_settings.vca_local_since y se reutiliza siempre.
 * @returns {Promise<Date>}
 */
async function resolveCutoff() {
  if (process.env.VCA_LOCAL_SINCE) return new Date(process.env.VCA_LOCAL_SINCE);
  if (cutoffCache) return cutoffCache;

  let row = await prisma.appSetting.findUnique({ where: { key: CUTOFF_KEY } });
  if (!row) {
    const initial = new Date();
    try {
      row = await prisma.appSetting.create({ data: { key: CUTOFF_KEY, value: initial.toISOString() } });
      logger.info(`[vcaService] Corte persistente inicializado: ${row.value}`);
    } catch {
      // Carrera: otro ciclo lo creó primero.
      row = await prisma.appSetting.findUnique({ where: { key: CUTOFF_KEY } });
    }
  }
  cutoffCache = new Date(row.value);
  return cutoffCache;
}

/**
 * Sanitiza una parte del nombre de archivo (igual que el agente anterior).
 * @param {*} value - Valor a sanitizar.
 * @returns {string}
 */
function safeFilePart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 100);
}

/**
 * Ruta del dashboard tal cual: trim, "/"→"\" y sin separadores finales.
 * @param {string} rawPath - Valor de lab.vcaNetworkPath.
 * @returns {string}
 */
function normalizeFolder(rawPath) {
  return String(rawPath || '')
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+$/, '');
}

/**
 * Arma el objeto de orden que consume el generador VCA a partir de la garantía.
 * @param {Object} warranty - Garantía con orderData.
 * @param {Object} store - Tienda (name, accn).
 * @returns {Object}
 */
function buildOrderForVca(warranty, store) {
  const orderData = warranty.orderData || {};
  return {
    ...orderData,
    tienda_id: warranty.storeId,
    tienda_nombre: store?.name || orderData.tienda_nombre || '',
    accn: store?.accn || orderData.accn || '000',
    orden_numero: warranty.orderNumber,
    codigo_completo: orderData.codigo_completo || warranty.orderNumber,
  };
}

/**
 * Nombre de archivo determinista (misma nomenclatura que el agente anterior).
 * @param {string} orderNumber
 * @param {string} storeId
 * @returns {string}
 */
function buildFilename(orderNumber, storeId) {
  return `Pedido_${safeFilePart(orderNumber)}_${safeFilePart(storeId)}.vca`;
}

/**
 * fs no soporta timeout nativo: carreramos la promesa contra un temporizador.
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise}
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`Timeout ${ms}ms en ${label}`), { code: 'VCA_TIMEOUT' })),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Escribe el archivo VCA con idempotencia + escritura atómica (tmp + rename).
 * @param {string} folderPath - Ruta destino (lab.vcaNetworkPath).
 * @param {string} filename
 * @param {string} content
 * @returns {Promise<{filepath: string, alreadyExisted: boolean}>}
 */
async function writeVcaFile(folderPath, filename, content) {
  const folder = normalizeFolder(folderPath);
  if (!folder) {
    throw Object.assign(new Error('vcaNetworkPath vacío'), { code: 'VCA_INVALID_PATH' });
  }

  const finalPath = path.join(folder, filename);
  const tmpPath = `${finalPath}.tmp`;

  await withTimeout(fs.mkdir(folder, { recursive: true }), WRITE_TIMEOUT_MS, 'mkdir');

  // Idempotencia: si ya existe el .vca final, no se reescribe.
  try {
    await withTimeout(fs.access(finalPath), WRITE_TIMEOUT_MS, 'access');
    logger.info(`[vcaService] VCA ya existe (idempotencia): ${finalPath}`);
    return { filepath: finalPath, alreadyExisted: true };
  } catch (err) {
    if (err.code && err.code !== 'ENOENT') throw err; // permiso/red → propagar
  }

  await withTimeout(fs.writeFile(tmpPath, content, 'utf8'), WRITE_TIMEOUT_MS, 'write');
  await withTimeout(fs.rename(tmpPath, finalPath), WRITE_TIMEOUT_MS, 'rename');
  return { filepath: finalPath, alreadyExisted: false };
}

/**
 * Genera el contenido y lo escribe para una garantía concreta.
 * @param {Object} warranty
 * @param {Object} store
 * @param {Object} lab
 * @returns {Promise<{filepath: string, alreadyExisted: boolean}>}
 */
async function deliverVcaForWarranty(warranty, store, lab) {
  const order = buildOrderForVca(warranty, store);
  const items = Array.isArray(order.items) ? order.items : [];
  const content = await generateVCAContent(order, items);
  const filename = buildFilename(warranty.orderNumber, warranty.storeId);
  return writeVcaFile(lab.vcaNetworkPath, filename, content);
}

/**
 * Entrega el VCA de una garantía y actualiza su estado en BD.
 * Nunca lanza: devuelve el resultado para que el llamador decida.
 * @param {Object} warranty
 * @param {Object} store
 * @param {Object} lab
 * @returns {Promise<{delivered:boolean, alreadyExisted?:boolean, filepath?:string, error?:string}>}
 */
async function deliverAndMark(warranty, store, lab) {
  // ✅ NUEVO: guard defensivo — las garantías "nueva OT pagada" nunca llevan VCA.
  if (warranty.requiresVca === false) {
    return { delivered: false, skipped: 'not_required' };
  }
  try {
    const { filepath, alreadyExisted } = await deliverVcaForWarranty(warranty, store, lab);

    await prisma.warranty.update({
      where: { id: warranty.id },
      data: { vcaDeliveredAt: new Date(), vcaLastError: null },
    });

    logger.info(`[vcaService] ${alreadyExisted ? 'ya existía' : 'entregado'}: ${filepath}`);
    return { delivered: true, alreadyExisted, filepath };
  } catch (err) {
    // El fallo NO toca la garantía; solo registra intento/error para reintento.
    await prisma.warranty
      .update({
        where: { id: warranty.id },
        data: {
          vcaAttempts: { increment: 1 },
          vcaLastError: String(err.message).slice(0, 500),
        },
      })
      .catch(() => {});
    logger.error(`[vcaService] Fallo VCA en ${warranty.orderNumber}: ${err.message}`);
    return { delivered: false, error: err.message };
  }
}

/**
 * Procesa un lote de garantías nuevas pendientes de VCA (vcaDeliveredAt = null).
 * No bloquea el hilo principal: operaciones async con timeout por escritura.
 * @param {{batchSize?: number}} [opts]
 * @returns {Promise<{total:number, delivered:number, failed:number, skippedExisting:number}>}
 */
async function deliverPending({ batchSize = 20 } = {}) {
  const since = await resolveCutoff();

  const warranties = await prisma.warranty.findMany({
    where: {
      vcaDeliveredAt: null,
      createdAt: { gte: since },
      vcaAttempts: { lt: MAX_ATTEMPTS },
      requiresVca: true, // ✅ NUEVO: garantías "nueva OT pagada" no requieren VCA
      lab: { vcaEnabled: true },
    },
    include: {
      store: { select: { id: true, name: true, accn: true } },
      lab: { select: { id: true, name: true, vcaNetworkPath: true, vcaEnabled: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const stats = { total: warranties.length, delivered: 0, failed: 0, skippedExisting: 0 };

  for (const warranty of warranties) {
    const result = await deliverAndMark(warranty, warranty.store, warranty.lab);

    if (!result.delivered) {
      stats.failed++;
    } else if (result.alreadyExisted) {
      stats.skippedExisting++;
    } else {
      stats.delivered++;
    }
  }

  return stats;
}

module.exports = {
  deliverPending,
  deliverVcaForWarranty,
  deliverAndMark,
  buildOrderForVca,
  buildFilename,
  writeVcaFile,
  resolveCutoff,
};
