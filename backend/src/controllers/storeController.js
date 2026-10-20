// backend/src/controllers/storeController.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const syncService = require('../services/syncService');
const vcaService = require('../services/vcaService');
const logger = require('../config/logger');
const { generateEscPosBuffer } = require('../legacy/printer');
const { applyNewArticleCodes, normalizeLensMaterialInput } = require('../utils/warrantyCase');
// Contrato del dominio "categoría de garantía": nada de listas crudas aquí.
const { isValidCategory, normalizeCategory, DEFAULT_CATEGORY } = require('../warrantyCategories');
const gesvisionApi = require('../legacy/gesvisionApi');

// Configurar Prisma con driver adapter (Prisma v7)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Obtiene y sincroniza una orden de GesVision.
 */
const getOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    if (!orderNumber) {
      return res.status(400).json({ error: 'El número de orden es obligatorio.' });
    }
    logger.info(`🏪 Tienda ${req.user.storeId} solicitando orden ${orderNumber}`);
    const orderData = await syncService.syncOrder(orderNumber);
    return res.status(200).json({
      message: 'Orden sincronizada exitosamente.',
      order: orderData
    });
  } catch (error) {
    logger.error(`❌ Error en getOrder: ${error.message}`);

    // Orden inexistente → 404 (el frontend puede distinguirlo de un fallo real).
    // Cubre ambos mensajes: "No se encontró..." y "No se pudo encontrar la orden...".
    const notFound = /no se encontró|no se pudo encontrar|no encontrada/i.test(error.message);
    if (notFound) {
      return res.status(404).json({
        error: error.message,
        details: error.message
      });
    }

    // Fallo de red / respuesta de GesVision → 502 (servicio externo)
    const NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH',
      'ENETUNREACH', 'EAI_AGAIN', 'EPIPE', 'ECONNREFUSED', 'ERR_NETWORK', 'ERR_BAD_RESPONSE'];
    const isNetworkError = (error.code && NETWORK_CODES.includes(error.code)) || !!error.response;
    if (isNetworkError) {
      return res.status(502).json({
        error: 'No se pudo consultar GesVision en este momento. Intenta de nuevo.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Error al sincronizar la orden.',
      details: error.message
    });
  }
};

/**
 * Crea una nueva garantía con los datos editados por la tienda.
 * Calcula automáticamente el sufijo de revisión (ej: "113200000336-1")
 * y lo inyecta en orderData para que el agente lo use en VCA y Tickets.
 */
const createWarranty = async (req, res) => {
  try {
    // ✅ CAMBIO 1/4: ahora también recibimos affectedEyes desde el frontend
    // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
    const { orderNumber, orderData, warrantyType, storeObservations, affectedEyes,
      warrantyCase, newFrameCode, newLensCode, newOrderNumber, category } = req.body;
    const storeId = req.user.storeId;

    // 1. Validar datos básicos del body
    if (!orderNumber || !orderData) {
      return res.status(400).json({ error: 'orderNumber y orderData son obligatorios.' });
    }
    if (!warrantyType) {
      return res.status(400).json({ error: 'El tipo de garantía es obligatorio.' });
    }

    // ✅ NUEVO: categoría de garantía ("DÓNDE originó el defecto").
    // Compatibilidad hacia atrás: si el cliente NO la envía → TIENDA (default
    // histórico). Si la envía inválida → 400 (no se corregiría en silencio).
    let warrantyCategory = DEFAULT_CATEGORY;
    if (category !== undefined && category !== null && String(category).trim() !== '') {
      warrantyCategory = normalizeCategory(category);
      if (!warrantyCategory || !isValidCategory(warrantyCategory)) {
        return res.status(400).json({
          error: 'Categoría de garantía inválida. Valores válidos: TIENDA, LABORATORIO.'
        });
      }
    }
    if (storeObservations && storeObservations.length > 300) {
      return res.status(400).json({ error: 'Las observaciones no pueden exceder 300 caracteres.' });
    }

    // ✅ NUEVO: Validaciones del tipo "Error de Tipo de Lente (Material)".
    // Función pura de utils/warrantyCase.js; responde 400 con el mensaje exacto.
    // Para los demás tipos devuelve flags por defecto (comportamiento intacto).
    const lensInput = normalizeLensMaterialInput({
      warrantyType, warrantyCase, newFrameCode, newLensCode, newOrderNumber,
    });
    if (lensInput.error) {
      return res.status(400).json({ error: lensInput.error });
    }
    const {
      requiresVca, requiresTicket, isNewOrderPaid,
      normalizedCase, normalizedFrameCode, normalizedLensCode, normalizedNewOrder,
    } = lensInput;

    // ✅ CAMBIO 2/4: normalizar ojos afectados ('OD' | 'OI' | 'BOTH')
    // Solo aplica para Error de RX / Transcripción. Para Error de Medida se guarda null.
    // Si el frontend aún no envía el campo, se guarda 'BOTH' por defecto (nada se rompe).
    // "Error de Tipo de Lente (Material)" NUNCA usa affectedEyes (queda null).
    const RX_TYPES = ['Error de RX', 'Error de Transcripcion'];
    let affectedEyesValue = null;
    if (RX_TYPES.includes(warrantyType)) {
      affectedEyesValue = ['OD', 'OI', 'BOTH'].includes(affectedEyes) ? affectedEyes : 'BOTH';
    }

    // 2. Obtener la tienda para validar ACCN y obtener labId
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, labId: true, accn: true, name: true }
    });
    if (!store) {
      return res.status(404).json({ error: 'Tienda no encontrada.' });
    }
    if (!store.accn || !/^\d{3}$/.test(store.accn)) {
      return res.status(400).json({
        error: 'La tienda debe tener un código ACCN de 3 dígitos numéricos configurado para crear garantías.'
      });
    }
    if (!store.labId) {
      return res.status(400).json({ error: 'La tienda no tiene un laboratorio asignado.' });
    }

    // 3. Lógica de Revisión (solo para casos que procesan en laboratorio)
    const MAX_RETRIES = 3;
    let attempts = 0;
    let createdWarranty = null;

    // ✅ NUEVO: Normalizar orderData para el Caso 1 (SAME_ORDER) antes de guardar:
    // los ítems de montura/cristal llevan los códigos nuevos (VCA y ticket los usan).
    let baseOrderData = orderData;
    if (normalizedCase === 'SAME_ORDER') {
      // ✅ NUEVO: resolver contra GesVision la descripción REAL de los códigos
      // nuevos (best-effort: si la API falla o no existe el artículo, se conserva
      // la descripción original y no bloquea la creación).
      const newDescriptions = {};
      try {
        const [frameProduct, lensProduct] = await Promise.all([
          gesvisionApi.searchProductByReference(normalizedFrameCode),
          gesvisionApi.searchProductByReference(normalizedLensCode),
        ]);
        if (frameProduct?.description) newDescriptions.frame = frameProduct.description;
        if (lensProduct?.description) newDescriptions.lens = lensProduct.description;
        logger.info(
          `[createWarranty] Descripciones resueltas (Caso SAME_ORDER): montura=${newDescriptions.frame || 'sin cambio'}, cristal=${newDescriptions.lens || 'sin cambio'}`
        );
      } catch (descErr) {
        logger.warn(`[createWarranty] No se pudo resolver la descripción en GesVision: ${descErr.message}`);
      }
      baseOrderData = applyNewArticleCodes(orderData, normalizedFrameCode, normalizedLensCode, newDescriptions);
    }

    if (isNewOrderPaid) {
      // ✅ NUEVO: Caso 2 (NEW_ORDER) — se guarda la nueva OT tal cual, sin
      // revisión ni sufijo, nace COMPLETED: nada pendiente para el laboratorio.
      const newOrderData = {
        ...baseOrderData,
        orden_numero: normalizedNewOrder,
        codigo_completo: normalizedNewOrder,
      };
      try {
        createdWarranty = await prisma.warranty.create({
          data: {
            storeId: store.id,
            labId: store.labId,
            orderNumber: normalizedNewOrder,
            revision: 1,
            orderData: newOrderData,
            warrantyType,
            storeObservations: storeObservations || null,
            affectedEyes: null,
            warrantyCase: normalizedCase,
            newOrderNumber: normalizedNewOrder,
            // ✅ NUEVO: categoría (dónde originó el defecto)
            category: warrantyCategory,
            requiresVca: false,
            requiresTicket: false,
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
      } catch (error) {
        if (error.code === 'P2002') {
          // Doble registro de la misma nueva OT (o colisión con garantía previa).
          logger.warn(`[createWarranty] Nueva OT ${normalizedNewOrder} ya registrada`);
          return res.status(400).json({ error: 'Ya existe una garantía registrada para esta nueva OT.' });
        }
        throw error;
      }
    } else {
      // Caso 1 y todos los tipos existentes: flujo actual de revisión.
      // 🔧 FIX DEFINITIVO: La base es codigo_completo (que tiene el número LARGO de GesVision)
      const baseOrderNumber = String(
        baseOrderData.codigo_completo || baseOrderData.orden_numero || orderNumber
      ).split('-')[0];

      while (attempts < MAX_RETRIES) {
        try {
          createdWarranty = await prisma.$transaction(async (tx) => {
            // a) Buscar TODAS las garantías para esta orden base
            const existingWarranties = await tx.warranty.findMany({
              where: {
                OR: [
                  { orderNumber: baseOrderNumber },
                  { orderNumber: { startsWith: baseOrderNumber + '-' } }
                ]
              },
              select: { revision: true }
            });

            // b) Encontrar la revisión máxima actual
            let maxRevision = 0;
            existingWarranties.forEach(w => {
              if (w.revision > maxRevision) {
                maxRevision = w.revision;
              }
            });

            // c) Calcular nuevos valores
            const newRevision = maxRevision + 1;
            const newOrderNumberFinal = `${baseOrderNumber}-${newRevision}`; // ej: "113200000336-1"

            // d) 🔧 FIX: Inyectar el número COMPLETO + sufijo en AMBOS campos
            const updatedOrderData = {
              ...baseOrderData,
              orden_numero: newOrderNumberFinal,
              codigo_completo: newOrderNumberFinal // 🔧 Sobreescribe para que los renderizadores lo lean completo
            };

            // e) Crear la garantía
            return await tx.warranty.create({
              data: {
                storeId: store.id,
                labId: store.labId,
                orderNumber: newOrderNumberFinal,
                revision: newRevision,
                orderData: updatedOrderData,
                warrantyType,
                storeObservations: storeObservations || null,
                // ✅ CAMBIO 3/4: guardar los ojos afectados en la BD
                affectedEyes: affectedEyesValue,
                // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
                warrantyCase: normalizedCase,
                newFrameCode: normalizedFrameCode,
                newLensCode: normalizedLensCode,
                // ✅ NUEVO: categoría (dónde originó el defecto)
                category: warrantyCategory,
                requiresVca,
                requiresTicket,
                status: 'PENDING'
              }
            });
          });
          // Si la transacción fue exitosa, salimos del bucle
          break;
        } catch (error) {
          // Si hay conflicto de unicidad (dos usuarios crearon al mismo tiempo), reintentar
          if (error.code === 'P2002') {
            attempts++;
            logger.warn(`[createWarranty] Conflicto de concurrencia en orden ${baseOrderNumber}, reintento ${attempts}/${MAX_RETRIES}`);
            if (attempts >= MAX_RETRIES) {
              throw new Error('Conflicto de concurrencia al crear la garantía después de múltiples intentos.');
            }
            // Pausa exponencial pequeña antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 100 * attempts));
          } else {
            throw error; // Cualquier otro error se lanza inmediatamente
          }
        }
      }
    }

    logger.info(`✅ Garantía creada: ${createdWarranty.id} para orden ${createdWarranty.orderNumber} (Rev: ${createdWarranty.revision}) por tienda ${store.name}`);

    // ✅ Entrega inmediata del VCA (fire-and-forget): no bloquea la respuesta ni
    // afecta la garantía (ya está commiteada). El cron queda como respaldo.
    // ✅ NUEVO: solo aplica si la garantía requiere VCA (Caso 2 NEW_ORDER no).
    if (createdWarranty.requiresVca) {
      prisma.lab
        .findUnique({ where: { id: store.labId }, select: { id: true, vcaNetworkPath: true, vcaEnabled: true } })
        .then((lab) => {
          if (!lab?.vcaEnabled) return null;
          return vcaService.deliverAndMark(createdWarranty, store, lab);
        })
        .catch((vcaErr) => logger.warn(`[createWarranty] VCA inmediato falló: ${vcaErr.message}`));
    }

    return res.status(201).json({
      message: createdWarranty.requiresVca
        ? 'Garantía creada exitosamente y encolada para el laboratorio.'
        : 'Garantía registrada como nueva orden pagada. No requiere VCA ni ticket.',
      warranty: {
        id: createdWarranty.id,
        orderNumber: createdWarranty.orderNumber,
        revision: createdWarranty.revision,
        status: createdWarranty.status,
        // ✅ NUEVO: categoría de garantía (dónde originó el defecto)
        category: createdWarranty.category,
        // ✅ CAMBIO 4/4: devolver los ojos afectados en la respuesta
        affectedEyes: createdWarranty.affectedEyes,
        // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
        warrantyCase: createdWarranty.warrantyCase,
        newOrderNumber: createdWarranty.newOrderNumber,
        newFrameCode: createdWarranty.newFrameCode,
        newLensCode: createdWarranty.newLensCode,
        requiresVca: createdWarranty.requiresVca,
        requiresTicket: createdWarranty.requiresTicket,
        createdAt: createdWarranty.createdAt
      }
    });
  } catch (error) {
    logger.error(`❌ Error en createWarranty: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor al crear la garantía.' });
  }
};

/**
 * GET /api/store/products/:code
 * Consulta en GesVision un artículo por su código mostrado en la venta
 * (ej: M121603, H000014) para que la tienda confirme visualmente el código
 * correcto y su descripción. Solo lectura; no valida ni modifica GesVision.
 */
const getProductByCode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'El código de producto es obligatorio.' });
    }
    const product = await gesvisionApi.searchProductByReference(code);
    if (!product) {
      return res.status(404).json({
        error: `No se encontró ningún producto con el código ${String(code).trim()}.`,
      });
    }
    return res.status(200).json({
      message: 'Producto encontrado.',
      product,
    });
  } catch (error) {
    logger.error(`❌ Error en getProductByCode: ${error.message}`);

    // Fallo de red / respuesta de GesVision → 502 (mismo criterio que getOrder)
    const NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH',
      'ENETUNREACH', 'EAI_AGAIN', 'EPIPE', 'ECONNREFUSED', 'ERR_NETWORK', 'ERR_BAD_RESPONSE'];
    const isNetworkError = (error.code && NETWORK_CODES.includes(error.code)) || !!error.response;
    if (isNetworkError) {
      return res.status(502).json({
        error: 'No se pudo consultar GesVision en este momento. Intenta de nuevo.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Error al consultar el producto.',
      details: error.message
    });
  }
};

// ============================================================
// FASE 5: LISTADO HISTÓRICO PARA TIENDAS (RF-03)
// ============================================================

/**
 * GET /api/store/warranties
 * Devuelve todas las garantías de la tienda autenticada.
 * Política de acceso: SOLO ve las suyas (RF-03.3).
 */
const getMyWarranties = async (req, res) => {
  try {
    const storeId = req.user.storeId || req.user.store?.id;
    if (!storeId) {
      return res.status(400).json({
        error: 'No se pudo identificar la tienda del usuario autenticado.'
      });
    }
    const warranties = await prisma.warranty.findMany({
      where: { storeId },
      select: {
        id: true,
        orderNumber: true,
        // ✅ NUEVO: categoría (dónde originó el defecto)
        category: true,
        status: true,
        createdAt: true,
        orderData: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ warranties });
  } catch (error) {
    logger.error(`[getMyWarranties] Error: ${error.message}`, {
      userId: req.user.id,
    });
    return res.status(500).json({ error: 'Error al obtener las garantías.' });
  }
};

/**
 * GET /api/store/warranties/:id
 * Devuelve el detalle de una garantía específica.
 * Verifica que la garantía pertenezca a la tienda autenticada (RF-03.3).
 */
const getWarrantyDetail = async (req, res) => {
  try {
    const storeId = req.user.storeId || req.user.store?.id;
    const { id } = req.params;
    if (!storeId) {
      return res.status(400).json({
        error: 'No se pudo identificar la tienda del usuario autenticado.'
      });
    }
    const warranty = await prisma.warranty.findFirst({
      where: {
        id,
        storeId, // 🔒 Filtro forzado por backend (RF-03.3)
      },
    });
    if (!warranty) {
      return res.status(404).json({
        error: 'Garantía no encontrada o no pertenece a tu tienda.',
      });
    }
    return res.status(200).json({ warranty });
  } catch (error) {
    logger.error(`[getWarrantyDetail] Error: ${error.message}`, {
      userId: req.user.id,
      warrantyId: req.params.id,
    });
    return res.status(500).json({ error: 'Error al obtener el detalle de la garantía.' });
  }
};

// ============================================================
// ️ NUEVO: IMPRESIÓN AUTOMÁTICA DESDE TIENDA
// ============================================================

/**
 * GET /api/store/ticket-buffer/:warrantyId
 * Genera el ticket ESC/POS (base64) para que la tienda imprima con QZ Tray.
 * El VCA se entrega aparte, de forma nativa, en services/vcaService.js.
 */
const getTicketBuffer = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const storeId = req.user.storeId;
    if (!storeId) return res.status(400).json({ error: 'Usuario sin tienda asignada.' });

    const warranty = await prisma.warranty.findUnique({
      where: { id: warrantyId },
      include: {
        lab: { select: { id: true, name: true, printerName: true } },
        store: { select: { name: true, accn: true } },
      },
    });
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });
    if (warranty.storeId !== storeId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu tienda.' });
    }

    // ✅ NUEVO: garantías "Nueva OT pagada" no tienen ticket de laboratorio.
    if (warranty.requiresTicket === false) {
      return res.status(409).json({ error: 'Esta garantía no requiere ticket: fue registrada como nueva orden pagada.' });
    }

    const items = warranty.orderData?.items || [];
    const orderForPrint = {
      ...warranty.orderData,
      warrantyType: warranty.warrantyType,
      storeObservations: warranty.storeObservations,
      affectedEyes: warranty.affectedEyes,
      accn: warranty.store?.accn || '000',
      tienda_nombre: warranty.store?.name || '',
      tienda_id: warranty.storeId,
      items,
    };

    const ticketBuffer = await generateEscPosBuffer(orderForPrint, items);

    return res.json({
      success: true,
      ticketBase64: ticketBuffer.toString('base64'),
      printerName: warranty.lab.printerName || 'Bixolon',
      warrantyId: warranty.id,
    });
  } catch (error) {
    logger.error(`[store.getTicketBuffer] ${error.message}`);
    return res.status(500).json({ error: 'Error interno al preparar impresión.' });
  }
};

/**
 * POST /api/store/warranties/:warrantyId/complete
 * Si la tienda logró imprimir el ticket, marca la garantía como COMPLETED.
 */
const completeWarranty = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const storeId = req.user.storeId;
    if (!storeId) return res.status(400).json({ error: 'Usuario sin tienda asignada.' });

    const warranty = await prisma.warranty.findUnique({
      where: { id: warrantyId },
      select: { id: true, storeId: true, status: true, orderNumber: true },
    });
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });
    if (warranty.storeId !== storeId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu tienda.' });
    }
    if (warranty.status === 'COMPLETED') {
      return res.status(400).json({ error: 'La garantía ya está completada.' });
    }

    const updated = await prisma.warranty.update({
      where: { id: warrantyId },
      data: { status: 'COMPLETED', processedAt: new Date(), processingStartedAt: null, errorMessage: null },
    });
    logger.info(`[store.completeWarranty] Garantía procesada desde tienda: ${updated.orderNumber}`);
    return res.json({
      success: true,
      warranty: { id: updated.id, orderNumber: updated.orderNumber, status: updated.status },
    });
  } catch (error) {
    logger.error(`[store.completeWarranty] ${error.message}`);
    return res.status(500).json({ error: 'Error al actualizar estado.' });
  }
};

module.exports = {
  getOrder,
  createWarranty,
  getProductByCode,
  getMyWarranties,
  getWarrantyDetail,
  getTicketBuffer,
  completeWarranty,
};