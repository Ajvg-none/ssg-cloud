// backend/src/cron/vcaDeliveryCron.js
const cron = require('node-cron');
const logger = require('../config/logger');
const { deliverPending, resolveCutoff } = require('../services/vcaService');

let running = false; // guard en memoria: evita solapar ciclos

/**
 * Ejecuta un ciclo de entrega VCA local (fs). Los fallos se registran en la
 * garantía (vcaAttempts/vcaLastError) y se reintentan en el próximo ciclo.
 */
const runVcaDelivery = async () => {
  if (running) {
    logger.warn('[vcaDelivery] Ciclo anterior aún en curso; se omite este turno.');
    return;
  }
  running = true;
  try {
    const stats = await deliverPending();
    if (stats.total > 0) {
      logger.info(
        `[vcaDelivery] total=${stats.total} entregadas=${stats.delivered} ` +
          `existentes=${stats.skippedExisting} fallidas=${stats.failed}`
      );
    }
  } catch (err) {
    logger.error(`[vcaDelivery] Error en ciclo: ${err.message}`);
  } finally {
    running = false;
  }
};

/**
 * Inicia el cron de entrega VCA local con el intervalo configurado.
 */
const startVcaDeliveryCron = () => {
  const schedule = process.env.VCA_RETRY_CRON || '*/2 * * * *';
  // Inicializa el corte persistente al arranque (no en el primer tick) para no
  // perder órdenes creadas entre el boot y la primera ejecución del cron.
  resolveCutoff()
    .then((since) => logger.info(`[vcaDelivery] Corte de entrega = ${since.toISOString()}`))
    .catch((err) => logger.warn(`[vcaDelivery] No se pudo inicializar el corte: ${err.message}`));
  cron.schedule(schedule, runVcaDelivery);
  logger.info(`[vcaDelivery] Cron de entrega VCA local iniciado (${schedule})`);
};

module.exports = {
  startVcaDeliveryCron,
  runVcaDelivery, // Exportado para pruebas manuales
};
