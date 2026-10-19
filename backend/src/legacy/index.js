/**
 * Punto de entrada unificado para el código heredado del middleware.
 * Todas las funciones copiadas del sistema en producción se exportan aquí
 * para facilitar su reutilización en el nuevo SGG.
 * 
 * IMPORTANTE: Estas funciones NO deben ser reescritas. Solo se adaptan
 * para recibir parámetros externos (URLs, credenciales) en lugar de
 * depender de variables de entorno o archivos de configuración locales.
 */

// ============================================================
// 1. API de GesVision v2 (autenticación v1, reintentos, endpoints v2)
// ============================================================
const gesvisionApi = require('./gesvisionApi');
const { mapOpticalOrderV2ToV1 } = require('./opticalOrderV2Mapper');

// ============================================================
// 2. Sincronización de órdenes (mapeo de datos crudos a objeto plano)
//    La función pura vive en fetchAndMapOrder.js; el servicio que la
//    consume y persiste en OrderCache es services/syncService.js.
// ============================================================

// ============================================================
// 3. Generación de contenido VCA (formato Lensware)
// ============================================================
const lensware = require('./lensware');

// ============================================================
// 4. Generación de tickets ESC/POS (impresión Bixolon)
// ============================================================
const printer = require('./printer');

// ============================================================
// EXPORTACIONES UNIFICADAS
// ============================================================

module.exports = {
  // --- GesVision API v2 ---
  gesvisionApi,
  // Adaptador OpticalOrderDocument (v2) → forma interna v1
  mapOpticalOrderV2ToV1,

  // --- Sincronización de órdenes ---
  fetchAndMapOrder: require('./fetchAndMapOrder').fetchAndMapOrder,

  // --- Lensware (VCA) ---
  // Función pura para generar contenido VCA (sin escribir en disco)
  generateVCAContent: lensware.generateVCAContent,
  cleanArticleCode: lensware.cleanArticleCode,

  // --- Printer (tickets ESC/POS) ---
  // Función pura para generar el texto del ticket
  generateTicketText: printer.generateTicketText,
  // Función pura para generar el buffer ESC/POS (lo imprime el frontend con QZ Tray)
  generateEscPosBuffer: printer.generateEscPosBuffer,
};