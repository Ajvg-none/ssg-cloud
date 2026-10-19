// backend/src/utils/exchangeRate.js
const axios = require('axios');
const logger = require('../config/logger');

const rateCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Obtiene la tasa de cambio histórica USD → VES (BCV) para una fecha dada.
 * Si no hay histórico disponible, fallback a la tasa actual.
 *
 * @param {string} dateStr - Fecha en formato 'YYYY-MM-DD'.
 * @returns {Promise<number>} Tasa de cambio (VES por 1 USD).
 */
async function getHistoricalUsdToVesRate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    logger.warn(`[ExchangeRate] Fecha inválida: "${dateStr}". Fallback a 1.`);
    return 1;
  }

  const cached = rateCache.get(dateStr);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    // 1. Intentar obtener el histórico
    const urlHistorico = `https://ve.dolarapi.com/v1/historicos/dolares/${dateStr}`;
    const response = await axios.get(urlHistorico, { timeout: 5000 });

    const data = Array.isArray(response.data) ? response.data : [response.data];
    const oficial = data.find((d) => d.nombre === 'Oficial') || data[0];
    const rate = oficial?.promedio || oficial?.precio;

    if (rate && typeof rate === 'number') {
      rateCache.set(dateStr, { rate, timestamp: Date.now() });
      logger.info(`[ExchangeRate] Tasa BCV histórica para ${dateStr}: ${rate} VES/USD`);
      return rate;
    }

    throw new Error('Tasa no encontrada en respuesta histórica');
  } catch (error) {
    logger.warn(`[ExchangeRate] Histórico falló para ${dateStr} (${error.message}). Intentando tasa actual...`);

    // 2. Fallback: intentar obtener la tasa actual del BCV
    try {
      const urlActual = 'https://ve.dolarapi.com/v1/dolares/oficial';
      const responseActual = await axios.get(urlActual, { timeout: 5000 });
      const rateActual = responseActual.data?.promedio || responseActual.data?.precio;

      if (rateActual && typeof rateActual === 'number') {
        logger.info(`[ExchangeRate] Usando tasa BCV actual para ${dateStr}: ${rateActual} VES/USD (fallback)`);
        rateCache.set(dateStr, { rate: rateActual, timestamp: Date.now() });
        return rateActual;
      }
    } catch (errorActual) {
      logger.warn(`[ExchangeRate] Tasa actual también falló: ${errorActual.message}`);
    }

    // 3. Último recurso
    logger.error(`[ExchangeRate] No se pudo obtener tasa para ${dateStr}. Fallback a 1.`);
    return 1;
  }
}

function clearRateCache() {
  rateCache.clear();
}

module.exports = { getHistoricalUsdToVesRate, clearRateCache };