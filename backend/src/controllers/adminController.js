// backend/src/controllers/adminController.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const vcaService = require('../services/vcaService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================
// GESTIÓN DE LABORATORIOS (RF-07.1)
// ============================================================
const createLab = async (req, res) => {
  try {
    const { name, agentIp, agentPort, vcaNetworkPath, printerName, printEnabled, vcaEnabled } = req.body;
    if (!name || !vcaNetworkPath) {
      return res.status(400).json({
        error: 'Campos obligatorios: name y vcaNetworkPath.',
      });
    }
    const apiKey = crypto.randomBytes(32).toString('hex');
    const lab = await prisma.lab.create({
      data: {
        name,
        agentIp: agentIp || '',
        agentPort: String(agentPort || '3001'),
        vcaNetworkPath,
        printerName: printerName || 'Bixolon',
        printEnabled: printEnabled !== false,
        vcaEnabled: vcaEnabled !== false,
        apiKey,
      },
    });
    logger.info(`✅ Laboratorio creado: ${lab.name}`, { labId: lab.id });
    return res.status(201).json({
      message: 'Laboratorio creado exitosamente.',
      lab: {
        id: lab.id,
        name: lab.name,
        agentIp: lab.agentIp,
        agentPort: lab.agentPort,
        vcaNetworkPath: lab.vcaNetworkPath,
        printerName: lab.printerName,
        printEnabled: lab.printEnabled,
        vcaEnabled: lab.vcaEnabled,
        pollInterval: lab.pollInterval,
        apiKey: lab.apiKey,
      },
    });
  } catch (error) {
    logger.error(`[createLab] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al crear el laboratorio.' });
  }
};

const getLabs = async (req, res) => {
  try {
    const labs = await prisma.lab.findMany({
      select: {
        id: true,
        name: true,
        agentIp: true,
        agentPort: true,
        vcaNetworkPath: true,
        apiKey: true,
        createdAt: true,
        printerName: true,
        printEnabled: true,
        vcaEnabled: true,
        pollInterval: true,
        _count: {
          select: { stores: true, warranties: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({
      labs: labs.map((lab) => ({
        id: lab.id,
        name: lab.name,
        agentIp: lab.agentIp,
        agentPort: lab.agentPort,
        vcaNetworkPath: lab.vcaNetworkPath,
        printerName: lab.printerName,
        printEnabled: lab.printEnabled,
        vcaEnabled: lab.vcaEnabled,
        pollInterval: lab.pollInterval,
        apiKey: lab.apiKey,
        createdAt: lab.createdAt,
        _count: lab._count,
      })),
    });
  } catch (error) {
    logger.error(`[getLabs] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener los laboratorios.' });
  }
};

const updateLab = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, agentIp, agentPort, vcaNetworkPath, printerName, printEnabled, vcaEnabled, pollInterval } = req.body;
    const lab = await prisma.lab.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(agentIp && { agentIp }),
        ...(agentPort && { agentPort: String(agentPort) }),
        ...(vcaNetworkPath && { vcaNetworkPath }),
        ...(printerName !== undefined && { printerName: printerName || 'Bixolon' }),
        ...(printEnabled !== undefined && { printEnabled }),
        ...(vcaEnabled !== undefined && { vcaEnabled }),
        ...(pollInterval !== undefined && { pollInterval: parseInt(pollInterval) || 5000 }),
      },
    });
    logger.info(`✅ Laboratorio actualizado: ${lab.name}`, { labId: lab.id });
    return res.status(200).json({
      message: 'Laboratorio actualizado exitosamente.',
      lab: {
        id: lab.id,
        name: lab.name,
        agentIp: lab.agentIp,
        agentPort: lab.agentPort,
        vcaNetworkPath: lab.vcaNetworkPath,
        printerName: lab.printerName,
        printEnabled: lab.printEnabled,
        vcaEnabled: lab.vcaEnabled,
        pollInterval: lab.pollInterval,
        apiKey: lab.apiKey,
        active: lab.active,
      },
    });
  } catch (error) {
    logger.error(`[updateLab] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al actualizar el laboratorio.' });
  }
};

const deleteLab = async (req, res) => {
  try {
    const { id } = req.params;
    const storesCount = await prisma.store.count({
      where: { labId: id },
    });
    if (storesCount > 0) {
      return res.status(400).json({
        error: `No se puede eliminar el laboratorio: tiene ${storesCount} tienda(s) asociada(s). Reasígnalas primero.`,
      });
    }
    await prisma.lab.delete({
      where: { id },
    });
    logger.info(`✅ Laboratorio eliminado: ${id}`);
    return res.status(200).json({
      message: 'Laboratorio eliminado exitosamente.',
    });
  } catch (error) {
    logger.error(`[deleteLab] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al eliminar el laboratorio.' });
  }
};

const regenerateLabApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const newApiKey = crypto.randomBytes(32).toString('hex');
    const lab = await prisma.lab.update({
      where: { id },
      data: { apiKey: newApiKey },
    });
    logger.info(`🔑 API Key regenerada para laboratorio: ${lab.name}`, { labId: lab.id });
    return res.status(200).json({
      message: 'API Key regenerada exitosamente.',
      apiKey: newApiKey,
    });
  } catch (error) {
    logger.error(`[regenerateLabApiKey] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al regenerar la API Key.' });
  }
};

// ============================================================
// GESTIÓN DE TIENDAS (RF-07.2) - MODIFICADO
// ============================================================
/**
 * POST /api/admin/stores
 * Crea una nueva tienda (entidad estática).
 * Los usuarios se crean por separado y se asocian a la tienda.
 */
const createStore = async (req, res) => {
  try {
    const { name, accn, labId } = req.body;
    
    // Validación de campos obligatorios
    if (!name || !accn || !labId) {
      return res.status(400).json({
        error: 'Los campos name, accn y labId son obligatorios.',
      });
    }
    
    // Validar ACCN: 3 dígitos numéricos
    if (!/^\d{3}$/.test(accn)) {
      return res.status(400).json({
        error: 'El ACCN debe ser exactamente 3 dígitos numéricos.',
      });
    }
    
    // Verificar que el ACCN sea único
    const existingStore = await prisma.store.findFirst({
      where: { accn },
    });
    if (existingStore) {
      return res.status(400).json({
        error: `Ya existe una tienda con el ACCN ${accn}.`,
      });
    }
    
    // Verificar que el laboratorio exista
    const lab = await prisma.lab.findUnique({
      where: { id: labId },
    });
    if (!lab) {
      return res.status(404).json({
        error: 'El laboratorio especificado no existe.',
      });
    }
    
    // Crear solo la tienda (sin usuario)
    const store = await prisma.store.create({
      data: {
        name,
        accn,
        labId,
        active: true,
      },
    });
    
    logger.info(`✅ Tienda creada: ${name} (ACCN: ${accn})`, {
      storeId: store.id,
      labId,
    });
    
    return res.status(201).json({
      message: 'Tienda creada exitosamente.',
      store: {
        id: store.id,
        name: store.name,
        accn: store.accn,
        labId: store.labId,
        active: store.active,
      },
    });
  } catch (error) {
    logger.error(`[createStore] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al crear la tienda.' });
  }
};

const getStores = async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      include: {
        lab: {
          select: { id: true, name: true },
        },
        _count: {
          select: { warranties: true, users: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({ stores });
  } catch (error) {
    logger.error(`[getStores] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener las tiendas.' });
  }
};

const updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, accn, labId, active } = req.body;
    
    if (accn && !/^\d{3}$/.test(accn)) {
      return res.status(400).json({
        error: 'El ACCN debe ser exactamente 3 dígitos numéricos.',
      });
    }
    
    if (accn) {
      const existing = await prisma.store.findFirst({
        where: {
          accn,
          id: { not: id },
        },
      });
      if (existing) {
        return res.status(400).json({
          error: `Ya existe otra tienda con el ACCN ${accn}.`,
        });
      }
    }
    
    const store = await prisma.store.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(accn && { accn }),
        ...(labId && { labId }),
        ...(active !== undefined && { active }),
      },
    });
    
    logger.info(`✅ Tienda actualizada: ${store.name}`, { storeId: store.id });
    return res.status(200).json({
      message: 'Tienda actualizada exitosamente.',
      store,
    });
  } catch (error) {
    logger.error(`[updateStore] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al actualizar la tienda.' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: 'La nueva contraseña debe tener al menos 6 caracteres.',
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    logger.info(`🔑 Contraseña reseteada para usuario: ${userId}`);
    return res.status(200).json({
      message: 'Contraseña reseteada exitosamente.',
    });
  } catch (error) {
    logger.error(`[resetUserPassword] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al resetear la contraseña.' });
  }
};

// ============================================================
// DASHBOARD DE GARANTÍAS (RF-07.3)
// ============================================================
const getWarrantiesDashboard = async (req, res) => {
  try {
    const {
      storeId,
      labId,
      status,
      search,
      warrantyType,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

     const where = {};
    if (storeId) where.storeId = storeId;
    if (labId) where.labId = labId;
    if (search) where.orderNumber = { contains: search, mode: 'insensitive' };
    if (warrantyType) where.warrantyType = warrantyType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Contadores para tarjetas: mismos filtros, EXCEPTO estado
    const whereCounts = { ...where };
    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, warranties, statusCounts] = await Promise.all([
      prisma.warranty.count({ where }),
      prisma.warranty.findMany({
        where,
        include: {
          store: {
            select: { id: true, name: true, accn: true },
          },
          lab: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.warranty.groupBy({
        by: ['status'],
        where: whereCounts,
        _count: { _all: true },
      }),
    ]);

    return res.status(200).json({
      warranties,
      statusCounts: statusCounts.reduce(
        (acc, row) => ({ ...acc, [row.status]: row._count._all }),
        {}
      ),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getWarrantiesDashboard] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener el dashboard.' });
  }
};

/**
 * POST /api/admin/warranties/:id/unlock
 * Reactiva una garantía (COMPLETED/ERROR/PENDING) para reproceso: la vuelve a
 * PENDING para que el laboratorio la procese de nuevo y fuerza la regeneración
 * del VCA (independiente del corte persistente). Solo ADMIN.
 */
const unlockWarranty = async (req, res) => {
  try {
    const { id } = req.params;
    const warranty = await prisma.warranty.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, accn: true } },
        lab: { select: { id: true, vcaNetworkPath: true, vcaEnabled: true } },
      },
    });
    if (!warranty) {
      return res.status(404).json({ error: 'Garantía no encontrada.' });
    }

    // ✅ NUEVO: garantías "Nueva OT pagada" no se desbloquean ni reprocesan.
    if (!warranty.requiresVca) {
      return res.status(400).json({
        error: 'Esta garantía fue registrada como nueva orden pagada; no requiere reproceso de VCA ni ticket.',
      });
    }

    // 1) Desbloquear: vuelve al dashboard del laboratorio.
    await prisma.warranty.update({
      where: { id },
      data: {
        status: 'PENDING',
        processingStartedAt: null,
        errorMessage: null,
        vcaDeliveredAt: null,
        vcaAttempts: 0,
        vcaLastError: null,
      },
    });

    // 2) Regenerar el VCA inmediatamente (bypasea el corte); idempotente si ya existe.
    let vca;
    if (warranty.lab?.vcaEnabled) {
      vca = await vcaService.deliverAndMark(warranty, warranty.store, warranty.lab);
    } else {
      vca = { delivered: false, skipped: 'vca_disabled' };
    }

    logger.info(`[unlockWarranty] Garantía ${warranty.orderNumber} desbloqueada (VCA: ${vca.delivered ? 'ok' : vca.error || vca.skipped}).`);

    return res.status(200).json({
      message: 'Garantía desbloqueada para reproceso.',
      warranty: { id: warranty.id, orderNumber: warranty.orderNumber, status: 'PENDING' },
      vca,
    });
  } catch (error) {
    logger.error(`[unlockWarranty] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al desbloquear la garantía.' });
  }
};

module.exports = {
  // Laboratorios
  createLab,
  getLabs,
  updateLab,
  deleteLab,
  regenerateLabApiKey,
  // Tiendas
  createStore,
  getStores,
  updateStore,
  // Usuarios
  resetUserPassword,
  // Dashboard
  getWarrantiesDashboard,
  unlockWarranty,
};