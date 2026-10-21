// backend/src/controllers/adminController.js
// Adaptador HTTP delgado: delega persistencia en repositorios y VCA en adapters.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { repositories, adapters } = require('../container');

// ============================================================
// GESTIÓN DE LABORATORIOS
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
    const lab = await repositories.labRepo.create({
      name,
      agentIp: agentIp || '',
      agentPort: String(agentPort || '3001'),
      vcaNetworkPath,
      printerName: printerName || 'Bixolon',
      printEnabled: printEnabled !== false,
      vcaEnabled: vcaEnabled !== false,
      apiKey,
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
    const labs = await repositories.labRepo.findWithCounts();
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
    const lab = await repositories.labRepo.update(id, {
      ...(name && { name }),
      ...(agentIp && { agentIp }),
      ...(agentPort && { agentPort: String(agentPort) }),
      ...(vcaNetworkPath && { vcaNetworkPath }),
      ...(printerName !== undefined && { printerName: printerName || 'Bixolon' }),
      ...(printEnabled !== undefined && { printEnabled }),
      ...(vcaEnabled !== undefined && { vcaEnabled }),
      ...(pollInterval !== undefined && { pollInterval: parseInt(pollInterval, 10) || 5000 }),
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
    const storesCount = await repositories.storeRepo.countByLabId(id);
    if (storesCount > 0) {
      return res.status(400).json({
        error: `No se puede eliminar el laboratorio: tiene ${storesCount} tienda(s) asociada(s). Reasígnalas primero.`,
      });
    }
    await repositories.labRepo.delete(id);
    logger.info(`✅ Laboratorio eliminado: ${id}`);
    return res.status(200).json({ message: 'Laboratorio eliminado exitosamente.' });
  } catch (error) {
    logger.error(`[deleteLab] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al eliminar el laboratorio.' });
  }
};

const regenerateLabApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const newApiKey = crypto.randomBytes(32).toString('hex');
    const lab = await repositories.labRepo.update(id, { apiKey: newApiKey });
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
// GESTIÓN DE TIENDAS
// ============================================================
const createStore = async (req, res) => {
  try {
    const { name, accn, labId } = req.body;
    if (!name || !accn || !labId) {
      return res.status(400).json({
        error: 'Los campos name, accn y labId son obligatorios.',
      });
    }
    if (!/^\d{3}$/.test(accn)) {
      return res.status(400).json({
        error: 'El ACCN debe ser exactamente 3 dígitos numéricos.',
      });
    }

    const existingStore = await repositories.storeRepo.findByAccn(accn);
    if (existingStore) {
      return res.status(400).json({
        error: `Ya existe una tienda con el ACCN ${accn}.`,
      });
    }

    const lab = await repositories.labRepo.findById(labId);
    if (!lab) {
      return res.status(404).json({
        error: 'El laboratorio especificado no existe.',
      });
    }

    const store = await repositories.storeRepo.create({ name, accn, labId, active: true });

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
    const stores = await repositories.storeRepo.findManyWithLabAndCounts();
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
      const existing = await repositories.storeRepo.findByAccn(accn, id);
      if (existing) {
        return res.status(400).json({
          error: `Ya existe otra tienda con el ACCN ${accn}.`,
        });
      }
    }

    const store = await repositories.storeRepo.update(id, {
      ...(name && { name }),
      ...(accn && { accn }),
      ...(labId && { labId }),
      ...(active !== undefined && { active }),
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
    await repositories.userRepo.updatePassword(userId, hashedPassword);
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
// DASHBOARD DE GARANTÍAS
// ============================================================
const getWarrantiesDashboard = async (req, res) => {
  try {
    const result = await repositories.warrantyRepo.findAdminDashboard(req.query);
    return res.status(200).json({
      warranties: result.warranties,
      statusCounts: result.statusCounts,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    logger.error(`[getWarrantiesDashboard] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener el dashboard.' });
  }
};

/**
 * POST /api/admin/warranties/:id/unlock
 */
const unlockWarranty = async (req, res) => {
  try {
    const { id } = req.params;
    const warranty = await repositories.warrantyRepo.findWithRelationsById(id);
    if (!warranty) {
      return res.status(404).json({ error: 'Garantía no encontrada.' });
    }

    if (!warranty.requiresVca || !warranty.requiresTicket) {
      return res.status(400).json({
        error: 'Esta garantía no genera VCA ni ticket; no requiere reproceso.',
      });
    }

    // Solo COMPLETED/ERROR se desbloquean: en ambos casos el reproceso vuelve a
    // PENDING y reentrega el VCA (el labouratorio reimprime el ticket al procesar).
    if (warranty.status !== 'COMPLETED' && warranty.status !== 'ERROR') {
      return res.status(400).json({
        error: 'Solo las garantías completadas o con error pueden desbloquearse para reproceso.',
      });
    }

    await repositories.warrantyRepo.resetForReprocess(id);

    let vca;
    if (warranty.lab?.vcaEnabled) {
      const outbox = await repositories.outboxRepo.resetForWarranty(id);
      vca = await adapters.vcaDelivery.deliver(warranty, warranty.store, warranty.lab);
      if (vca.delivered) {
        await repositories.outboxRepo.markDone(outbox.id);
      }
    } else {
      vca = { delivered: false, skipped: 'vca_disabled' };
    }

    logger.info(
      `[unlockWarranty] Garantía ${warranty.orderNumber} desbloqueada (VCA: ${
        vca.delivered ? 'ok' : vca.error || vca.skipped
      }).`
    );

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
  createLab,
  getLabs,
  updateLab,
  deleteLab,
  regenerateLabApiKey,
  createStore,
  getStores,
  updateStore,
  resetUserPassword,
  getWarrantiesDashboard,
  unlockWarranty,
};
