// backend/src/controllers/labController.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const logger = require('../config/logger');
const { generateEscPosBuffer } = require('../legacy/printer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * GET /api/lab/ticket-buffer/:warrantyId
 * Genera el ticket ESC/POS y devuelve el base64 para que el frontend lo imprima con QZ Tray.
 * El VCA se entrega aparte, de forma nativa, en services/vcaService.js.
 */
const getTicketBuffer = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userLabId = req.user.labId;

    if (!['LABORATORIO', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const warranty = await prisma.warranty.findUnique({
      where: { id: warrantyId },
      include: {
        lab: { select: { id: true, name: true, printerName: true } },
        store: { select: { name: true, accn: true } },
      },
    });

    if (!warranty) return res.status(404).json({ error: 'Garantía no encontrada.' });

    // Validación de pertenencia
    if (userRole === 'LABORATORIO' && warranty.labId !== userLabId) {
      return res.status(403).json({ error: 'Esta garantía no pertenece a tu laboratorio.' });
    }

    // Preparar datos para impresión (misma lógica que ya tenías)
    const items = warranty.orderData?.items || [];
    const orderForPrint = {
      ...warranty.orderData,              // ← ESTA LÍNEA FALTABA
      warrantyType: warranty.warrantyType,
      storeObservations: warranty.storeObservations,
      affectedEyes: warranty.affectedEyes,
      accn: warranty.store?.accn || '000',
      tienda_nombre: warranty.store?.name || '',
      items: items,
    };

    // 1. Generar Buffer ESC/POS
    let ticketBuffer;
    try {
      ticketBuffer = await generateEscPosBuffer(orderForPrint, items);
    } catch (err) {
      logger.error(`Error generando buffer: ${err.message}`);
      return res.status(500).json({ error: 'Error al generar el ticket.' });
    }

    logger.info(`[getTicketBuffer] Ticket generado para garantía ${warrantyId}`, { orderNumber: warranty.orderNumber });

    // 2. Devolver al frontend
    return res.json({
      success: true,
      ticketBase64: ticketBuffer.toString('base64'),
      printerName: warranty.lab.printerName || 'Bixolon', // Nombre exacto para QZ Tray
      warrantyId: warranty.id
    });

  } catch (error) {
    logger.error(`[getTicketBuffer] ${error.message}`);
    return res.status(500).json({ error: 'Error interno al preparar impresión.' });
  }
};

/**
 * GET /api/lab/test-ticket
 * Genera un ticket de prueba (sin imprimir). El frontend lo imprime con QZ Tray.
 */
const getTestTicket = async (req, res) => {
  try {
    const lab = await prisma.lab.findUnique({
      where: { id: req.user.labId },
      select: { printerName: true },
    });

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

    const ticketBuffer = await generateEscPosBuffer(testOrder, []);

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
 * Configuración de impresión del laboratorio (sin agente).
 */
const getPrintConfig = async (req, res) => {
  try {
    const lab = await prisma.lab.findUnique({
      where: { id: req.user.labId },
      select: { printerName: true, vcaNetworkPath: true, vcaEnabled: true },
    });

    if (!lab) return res.status(404).json({ error: 'Laboratorio no encontrado.' });

    return res.status(200).json(lab);
  } catch (error) {
    logger.error(`[getPrintConfig] ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener configuración de impresión.' });
  }
};

/**
 * POST /api/lab/warranties/:warrantyId/complete
 * El frontend confirma que el ticket se imprimió con QZ Tray y marca la garantía como COMPLETED.
 */
const markAsCompleted = async (req, res) => {
  const { warrantyId } = req.params;
  const userRole = req.user.role;
  const userLabId = req.user.labId;

  try {
    if (!['LABORATORIO', 'ADMIN'].includes(userRole)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const warranty = await prisma.warranty.findUnique({
      where: { id: warrantyId },
      select: { id: true, labId: true, status: true, orderNumber: true },
    });

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

    const updated = await prisma.warranty.update({
      where: { id: warrantyId },
      data: { status: 'COMPLETED', processedAt: new Date(), processingStartedAt: null, errorMessage: null },
    });

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
    const labId = req.user.labId;
    const { search, storeId, status, startDate, endDate, page = 1, limit = 20 } = req.query;

    const where = { labId };
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;
    if (search) where.orderNumber = { contains: search, mode: 'insensitive' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, warranties] = await Promise.all([
      prisma.warranty.count({ where }),
      prisma.warranty.findMany({
        where,
        include: { store: { select: { id: true, name: true, accn: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
    ]);

    return res.status(200).json({
      warranties,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    logger.error(`[getMyLabWarranties] ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener garantías.' });
  }
};

/**
 * GET /api/lab/stores
 * Devuelve las tiendas del laboratorio autenticado.
 */
const getMyStores = async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      where: { labId: req.user.labId, active: true },
      select: { id: true, name: true, accn: true },
      orderBy: { name: 'asc' },
    });
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
