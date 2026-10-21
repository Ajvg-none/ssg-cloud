// backend/src/cron/vcaDeliveryCron.js
// Consumidor del outbox VCA. Reemplaza el escaneo directo de garantías.
const logger = require('../config/logger');

let running = false;
let intervalId = null;
let workerInstance = null;

const getWorker = () => {
  if (!workerInstance) {
    // Lazy require para evitar ciclos en el arranque.
    workerInstance = require('../container').vcaOutboxWorker;
  }
  return workerInstance;
};

const runVcaDelivery = async () => {
  if (running) {
    logger.warn('[vcaOutbox] Ciclo anterior aún en curso; se omite este turno.');
    return;
  }
  running = true;
  try {
    const stats = await getWorker().runOnce();
    if (stats.claimed > 0 || stats.backfilled > 0 || stats.failed > 0) {
      logger.info(
        `[vcaOutbox] backfill=${stats.backfilled} claimed=${stats.claimed} ` +
          `entregadas=${stats.delivered} reintentos=${stats.retried} fallidas=${stats.failed}`
      );
    }
  } catch (err) {
    logger.error(`[vcaOutbox] Error en ciclo: ${err.message}`);
  } finally {
    running = false;
  }
};

const startVcaDeliveryCron = (worker) => {
  workerInstance = worker || null;
  const intervalMs = parseInt(process.env.VCA_OUTBOX_INTERVAL_MS, 10) || 15000;

  intervalId = setInterval(runVcaDelivery, intervalMs);
  if (typeof intervalId.unref === 'function') intervalId.unref();

  logger.info(`[vcaOutbox] Worker de entrega VCA iniciado (cada ${intervalMs} ms)`);
};

const stopVcaDeliveryCron = () => {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
};

module.exports = {
  startVcaDeliveryCron,
  stopVcaDeliveryCron,
  runVcaDelivery,
};
