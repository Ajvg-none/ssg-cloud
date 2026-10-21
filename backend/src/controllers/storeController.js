// backend/src/controllers/storeController.js
// Adaptador HTTP delgado: valida el contrato y delega en casos de uso/repositorios.
const logger = require('../config/logger');
const { DomainError } = require('../domain/errors');
const { repositories, adapters, useCases } = require('../container');
const { getTemporaryBlockReason } = require('../services/warrantyTypePolicy');

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
    const orderData = await useCases.syncOrderUseCase.execute(orderNumber);
    return res.status(200).json({
      message: 'Orden sincronizada exitosamente.',
      order: orderData,
    });
  } catch (error) {
    logger.error(`❌ Error en getOrder: ${error.message}`);

    const notFound = /no se encontró|no se pudo encontrar|no encontrada/i.test(error.message);
    if (notFound) {
      return res.status(404).json({
        error: error.message,
        details: error.message,
      });
    }

    const NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH',
      'ENETUNREACH', 'EAI_AGAIN', 'EPIPE', 'ECONNREFUSED', 'ERR_NETWORK', 'ERR_BAD_RESPONSE'];
    const isNetworkError = (error.code && NETWORK_CODES.includes(error.code)) || !!error.response;
    if (isNetworkError) {
      return res.status(502).json({
        error: 'No se pudo consultar GesVision en este momento. Intenta de nuevo.',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: 'Error al sincronizar la orden.',
      details: error.message,
    });
  }
};

/**
 * Crea una nueva garantía. La orquestación vive en CreateWarrantyUseCase.
 */
const createWarranty = async (req, res) => {
  try {
    // Bloqueo temporal: los tipos del laboratorio existen en el catálogo,
    // pero su lógica de negocio aún no fue definida por la directiva.
    const temporaryBlock = getTemporaryBlockReason(req.body?.warrantyType);
    if (temporaryBlock) {
      return res.status(400).json({ error: temporaryBlock });
    }

    const created = await useCases.createWarrantyUseCase.execute(req.body, {
      storeId: req.user.storeId,
    });

    return res.status(201).json({
      message: created.requiresVca
        ? 'Garantía creada exitosamente y encolada para el laboratorio.'
        : 'Garantía registrada como nueva orden pagada. No requiere VCA ni ticket.',
      warranty: {
        id: created.id,
        orderNumber: created.orderNumber,
        revision: created.revision,
        status: created.status,
        category: created.category,
        affectedEyes: created.affectedEyes,
        warrantyCase: created.warrantyCase,
        newOrderNumber: created.newOrderNumber,
        newFrameCode: created.newFrameCode,
        newLensCode: created.newLensCode,
        requiresVca: created.requiresVca,
        requiresTicket: created.requiresTicket,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof DomainError && error.status < 500) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error(`❌ Error en createWarranty: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor al crear la garantía.' });
  }
};

/**
 * GET /api/store/products/:code
 */
const getProductByCode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'El código de producto es obligatorio.' });
    }
    const product = await adapters.productCatalog.getByCode(code);
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

    const NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH',
      'ENETUNREACH', 'EAI_AGAIN', 'EPIPE', 'ECONNREFUSED', 'ERR_NETWORK', 'ERR_BAD_RESPONSE'];
    const isNetworkError = (error.code && NETWORK_CODES.includes(error.code)) || !!error.response;
    if (isNetworkError) {
      return res.status(502).json({
        error: 'No se pudo consultar GesVision en este momento. Intenta de nuevo.',
        details: error.message,
      });
    }

    return res.status(500).json({
      error: 'Error al consultar el producto.',
      details: error.message,
    });
  }
};

/**
 * GET /api/store/warranties
 */
const getMyWarranties = async (req, res) => {
  try {
    const storeId = req.user.storeId || req.user.store?.id;
    if (!storeId) {
      return res.status(400).json({
        error: 'No se pudo identificar la tienda del usuario autenticado.',
      });
    }
    const warranties = await repositories.warrantyRepo.findByStoreId(storeId);
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
 */
const getWarrantyDetail = async (req, res) => {
  try {
    const storeId = req.user.storeId || req.user.store?.id;
    const { id } = req.params;
    if (!storeId) {
      return res.status(400).json({
        error: 'No se pudo identificar la tienda del usuario autenticado.',
      });
    }
    const warranty = await repositories.warrantyRepo.findByIdForStore(id, storeId);
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

/**
 * GET /api/store/ticket-buffer/:warrantyId
 */
const getTicketBuffer = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const storeId = req.user.storeId;
    if (!storeId) return res.status(400).json({ error: 'Usuario sin tienda asignada.' });

    const warranty = await repositories.warrantyRepo.findDetailedById(warrantyId);
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });
    if (warranty.storeId !== storeId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu tienda.' });
    }
    if (warranty.requiresTicket === false) {
      return res.status(409).json({
        error: 'Esta garantía no requiere ticket: fue registrada como nueva orden pagada.',
      });
    }

    const items = warranty.orderData?.items || [];
    const orderForPrint = {
      ...warranty.orderData,
      warrantyType: warranty.warrantyType,
      storeObservations: warranty.storeObservations,
      affectedEyes: warranty.affectedEyes,
      accn: warranty.store?.accn || '000',
      tienda_nombre: warranty.store?.name || '',
      items,
    };

    const ticketBuffer = await adapters.ticketRenderer.render(orderForPrint, items);

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
 */
const completeWarranty = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const storeId = req.user.storeId;
    if (!storeId) return res.status(400).json({ error: 'Usuario sin tienda asignada.' });

    const warranty = await repositories.warrantyRepo.findBasicById(warrantyId);
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });
    if (warranty.storeId !== storeId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu tienda.' });
    }
    if (warranty.status === 'COMPLETED') {
      return res.status(400).json({ error: 'La garantía ya está completada.' });
    }

    const updated = await repositories.warrantyRepo.markCompleted(warrantyId);
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
