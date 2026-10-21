// backend/src/controllers/labController.js
// Adaptador HTTP delgado del laboratorio.
const logger = require('../config/logger');
const { repositories, adapters } = require('../container');

/**
 * GET /api/lab/ticket-buffer/:warrantyId
 */
const getTicketBuffer = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const userRole = req.user.role;
    const userLabId = req.user.labId;

    if (!['LABORATORIO', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const warranty = await repositories.warrantyRepo.findDetailedById(warrantyId);
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });

    if (userRole === 'LABORATORIO' && warranty.labId !== userLabId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu laboratorio.' });
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

    let ticketBuffer;
    try {
      ticketBuffer = await adapters.ticketRenderer.render(orderForPrint, items);
    } catch (err) {
      logger.error(`Error generando buffer: ${err.message}`);
      return res.status(500).json({ error: 'Error al generar el ticket.' });
    }

    logger.info(`[getTicketBuffer] Ticket generado para garantía ${warrantyId}`, {
      orderNumber: warranty.orderNumber,
    });

    return res.json({
      success: true,
      ticketBase64: ticketBuffer.toString('base64'),
      printerName: warranty.lab.printerName || 'Bixolon',
      warrantyId: warranty.id,
    });
  } catch (error) {
    logger.error(`[getTicketBuffer] ${error.message}`);
    return res.status(500).json({ error: 'Error interno al preparar impresión.' });
  }
};

/**
 * GET /api/lab/test-ticket
 */
const getTestTicket = async (req, res) => {
  try {
    const lab = await repositories.labRepo.findPrinterName(req.user.labId);
    if (!lab) return res.status(404).json({ error: 'Laboratorio no encontrado.' });

    const testOrder = {
      orden_numero: 'TEST-0000',
      cliente_nombre: 'PRUEBA DE IMPRESION',
      od_esfera: '0.00',
      od_cilindro: '0.00',
      od_eje: '0',
      oi_esfera: '0.00',
      oi_cilindro: '0.00',
      oi_eje: '0',
      observaciones: 'Ticket de prueba - SGG',
      items: [],
    };

    const ticketBuffer = await adapters.ticketRenderer.render(testOrder, []);

    return res.status(200).json({
      ticketBase64: ticketBuffer.toString('base64'),
      printerName: lab.printerName || 'Bixolon',
    });
  } catch (error) {
    logger.error(`[getTestTicket] ${error.message}`);
    return res.status(500).json({ error: 'Error al generar ticket de prueba.' });
  }
};

/**
 * GET /api/lab/print-config
 */
const getPrintConfig = async (req, res) => {
  try {
    const lab = await repositories.labRepo.findPrintConfig(req.user.labId);
    if (!lab) return res.status(404).json({ error: 'Laboratorio no encontrado.' });
    return res.status(200).json(lab);
  } catch (error) {
    logger.error(`[getPrintConfig] ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener configuración de impresión.' });
  }
};

/**
 * POST /api/lab/warranties/:warrantyId/complete
 */
const markAsCompleted = async (req, res) => {
  const { warrantyId } = req.params;
  const userRole = req.user.role;
  const userLabId = req.user.labId;

  try {
    if (!['LABORATORIO', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const warranty = await repositories.warrantyRepo.findBasicById(warrantyId);
    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });

    if (userRole === 'LABORATORIO' && warranty.labId !== userLabId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu laboratorio.' });
    }
    if (warranty.status === 'COMPLETED') {
      return res.status(400).json({ error: 'La garantía ya está completada.' });
    }
    if (!['PENDING', 'PROCESSING', 'ERROR'].includes(warranty.status)) {
      return res.status(400).json({ error: `Estado inválido: ${warranty.status}.` });
    }

    const updated = await repositories.warrantyRepo.markCompleted(warrantyId);

    logger.info(`[markAsCompleted] Garantía completada: ${warrantyId}`, {
      labId: warranty.labId,
      orderNumber: updated.orderNumber,
    });

    return res.json({
      success: true,
      warranty: { id: updated.id, orderNumber: updated.orderNumber, status: updated.status },
    });
  } catch (error) {
    logger.error(`[markAsCompleted] ${error.message}`);
    return res.status(500).json({ error: 'Error al actualizar estado.' });
  }
};

/**
 * GET /api/lab/warranties
 */
const getMyLabWarranties = async (req, res) => {
  try {
    const { search, storeId, status, category, startDate, endDate, page = 1, limit = 20 } = req.query;
    const result = await repositories.warrantyRepo.findForLab({
      labId: req.user.labId,
      search,
      storeId,
      status,
      category,
      startDate,
      endDate,
      page,
      limit,
    });

    return res.status(200).json({
      warranties: result.warranties,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    logger.error(`[getMyLabWarranties] ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener garantías.' });
  }
};

/**
 * GET /api/lab/stores
 */
const getMyStores = async (req, res) => {
  try {
    const stores = await repositories.storeRepo.findByLabIdActive(req.user.labId);
    return res.status(200).json({ stores });
  } catch (error) {
    logger.error(`[getMyStores] ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener tiendas.' });
  }
};

module.exports = {
  getTicketBuffer,
  markAsCompleted,
  getPrintConfig,
  getTestTicket,
  getMyLabWarranties,
  getMyStores,
};
