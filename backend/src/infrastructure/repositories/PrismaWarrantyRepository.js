// backend/src/infrastructure/repositories/PrismaWarrantyRepository.js
// Encapsula Prisma para garantías: consultas, transacción de revisión,
// reintentos por concurrencia (P2002) y transiciones de estado.
const { DuplicateOrderError, RevisionConflictError } = require('../../domain/errors');

const MAX_REVISION_RETRIES = 3;

class PrismaWarrantyRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Nueva OT pagada: nace COMPLETED y sin VCA/ticket.
   * Traduce la violación de unicidad a un error de dominio.
   */
  async createNewPaidOrder(data) {
    try {
      return await this.prisma.warranty.create({ data });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new DuplicateOrderError('Ya existe una garantía registrada para esta nueva OT.');
      }
      throw error;
    }
  }

  /**
   * Crea la siguiente revisión de una garantía dentro de una transacción.
   * `enqueue(tx, warranty)` permite insertar el outbox en la misma transacción.
   * Reintenta ante colisiones de unicidad (P2002).
   */
  async createWithNextRevision({ baseOrderData, orderNumber, data }, enqueue) {
    const baseOrderNumber = String(
      baseOrderData.codigo_completo || baseOrderData.orden_numero || orderNumber
    ).split('-')[0];

    let attempts = 0;
    while (attempts < MAX_REVISION_RETRIES) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existingWarranties = await tx.warranty.findMany({
            where: {
              OR: [
                { orderNumber: baseOrderNumber },
                { orderNumber: { startsWith: `${baseOrderNumber}-` } },
              ],
            },
            select: { revision: true },
          });

          const maxRevision = existingWarranties.reduce(
            (max, w) => (w.revision > max ? w.revision : max),
            0
          );
          const newRevision = maxRevision + 1;
          const finalOrderNumber = `${baseOrderNumber}-${newRevision}`;

          const created = await tx.warranty.create({
            data: {
              ...data,
              orderNumber: finalOrderNumber,
              revision: newRevision,
              orderData: {
                ...baseOrderData,
                orden_numero: finalOrderNumber,
                codigo_completo: finalOrderNumber,
              },
            },
          });

          if (enqueue) await enqueue(tx, created);
          return created;
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        attempts += 1;
        if (attempts >= MAX_REVISION_RETRIES) {
          throw new RevisionConflictError(
            'Conflicto de concurrencia al crear la garantía después de múltiples intentos.'
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
      }
    }

    throw new RevisionConflictError('No se pudo asignar la revisión de la garantía.');
  }

  async findByStoreId(storeId) {
    return this.prisma.warranty.findMany({
      where: { storeId },
      select: {
        id: true,
        orderNumber: true,
        category: true,
        status: true,
        createdAt: true,
        orderData: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdForStore(id, storeId) {
    return this.prisma.warranty.findFirst({ where: { id, storeId } });
  }

  async findDetailedById(id) {
    return this.prisma.warranty.findUnique({
      where: { id },
      include: {
        lab: { select: { id: true, name: true, printerName: true, vcaNetworkPath: true, vcaEnabled: true } },
        store: { select: { name: true, accn: true } },
      },
    });
  }

  async findBasicById(id) {
    return this.prisma.warranty.findUnique({
      where: { id },
      select: { id: true, storeId: true, labId: true, status: true, orderNumber: true, requiresVca: true },
    });
  }

  async findWithRelationsById(id) {
    return this.prisma.warranty.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, accn: true } },
        lab: { select: { id: true, vcaNetworkPath: true, vcaEnabled: true } },
      },
    });
  }

  async findForLab({ labId, search, storeId, status, category, startDate, endDate, page = 1, limit = 20 }) {
    const where = { labId };
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;
    if (category) where.category = category;
    if (search) where.orderNumber = { contains: search, mode: 'insensitive' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [total, warranties] = await Promise.all([
      this.prisma.warranty.count({ where }),
      this.prisma.warranty.findMany({
        where,
        include: { store: { select: { id: true, name: true, accn: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { total, warranties, page: parseInt(page, 10), limit: take };
  }

  async findAdminDashboard({ storeId, labId, status, search, warrantyType, category, startDate, endDate, page = 1, limit = 20 }) {
    const where = {};
    if (storeId) where.storeId = storeId;
    if (labId) where.labId = labId;
    if (search) where.orderNumber = { contains: search, mode: 'insensitive' };
    if (warrantyType) where.warrantyType = warrantyType;
    if (category) where.category = category;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const whereCounts = { ...where };
    if (status) where.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [total, warranties, statusCounts] = await Promise.all([
      this.prisma.warranty.count({ where }),
      this.prisma.warranty.findMany({
        where,
        include: {
          store: { select: { id: true, name: true, accn: true } },
          lab: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.warranty.groupBy({
        by: ['status'],
        where: whereCounts,
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      warranties,
      statusCounts: statusCounts.reduce((acc, row) => ({ ...acc, [row.status]: row._count._all }), {}),
      page: parseInt(page, 10),
      limit: take,
    };
  }

  async markCompleted(id) {
    return this.prisma.warranty.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        processingStartedAt: null,
        errorMessage: null,
      },
    });
  }

  async resetForReprocess(id) {
    return this.prisma.warranty.update({
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
  }

  async cleanupOrphans(threshold) {
    const orphans = await this.prisma.warranty.findMany({
      where: {
        status: 'PROCESSING',
        processingStartedAt: { lt: threshold },
      },
      select: { id: true, orderNumber: true, labId: true, processingStartedAt: true },
    });

    if (orphans.length === 0) return { count: 0, orphans };

    const result = await this.prisma.warranty.updateMany({
      where: { id: { in: orphans.map((w) => w.id) } },
      data: { status: 'PENDING', processingStartedAt: null },
    });

    return { count: result.count, orphans };
  }
}

module.exports = PrismaWarrantyRepository;
