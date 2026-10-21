// backend/src/infrastructure/repositories/PrismaVcaOutboxRepository.js
// Outbox transaccional: la garantía y su evento VCA se crean en la misma tx.
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');

class PrismaVcaOutboxRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async enqueue(tx, warrantyId) {
    return tx.vcaOutbox.upsert({
      where: { warrantyId },
      update: {},
      create: { warrantyId },
    });
  }

  /**
   * Encola garantías pendientes de VCA que no tienen fila de outbox
   * (históricas o creadas durante una caída). Idempotente.
   */
  async backfillFromPendingWarranties({ limit = 100, maxAttempts = 5 } = {}) {
    const pending = await this.prisma.warranty.findMany({
      where: {
        requiresVca: true,
        vcaDeliveredAt: null,
        vcaAttempts: { lt: maxAttempts },
        lab: { vcaEnabled: true },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    if (pending.length === 0) return 0;

    const ids = pending.map((w) => w.id);
    const existing = await this.prisma.vcaOutbox.findMany({
      where: { warrantyId: { in: ids } },
      select: { warrantyId: true },
    });
    const existingIds = new Set(existing.map((row) => row.warrantyId));
    const rows = ids
      .filter((id) => !existingIds.has(id))
      .map((warrantyId) => ({
        id: crypto.randomUUID(),
        warrantyId,
        updatedAt: new Date(),
      }));

    if (rows.length === 0) return 0;
    const result = await this.prisma.vcaOutbox.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  /**
   * Reclama un lote con FOR UPDATE SKIP LOCKED para soportar múltiples workers.
   */
  async claimDue(limit = 10) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH due AS (
        SELECT id
        FROM vca_outbox
        WHERE status = 'PENDING' AND available_at <= NOW()
        ORDER BY available_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE vca_outbox AS o
      SET status = 'PROCESSING', locked_at = NOW(), updated_at = NOW()
      FROM due
      WHERE o.id = due.id
      RETURNING o.id, o.warranty_id AS "warrantyId", o.attempts
    `);
  }

  async markDone(id) {
    return this.prisma.vcaOutbox.update({
      where: { id },
      data: { status: 'DONE', lockedAt: null, lastError: null },
    });
  }

  /**
   * Reencola explícitamente una garantía (p. ej. unlock de admin).
   * Devuelve la fila para poder marcarla DONE si la entrega directa funciona.
   */
  async resetForWarranty(warrantyId) {
    return this.prisma.vcaOutbox.upsert({
      where: { warrantyId },
      update: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
      create: { warrantyId },
    });
  }

  async markRetry(id, attempts, message, delayMs) {
    return this.prisma.vcaOutbox.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts,
        lockedAt: null,
        lastError: String(message).slice(0, 500),
        availableAt: new Date(Date.now() + delayMs),
      },
    });
  }

  async markFailed(id, attempts, message) {
    return this.prisma.vcaOutbox.update({
      where: { id },
      data: {
        status: 'FAILED',
        attempts,
        lockedAt: null,
        lastError: String(message).slice(0, 500),
      },
    });
  }

  async recoverStaleProcessing(threshold) {
    return this.prisma.vcaOutbox.updateMany({
      where: { status: 'PROCESSING', lockedAt: { lt: threshold } },
      data: { status: 'PENDING', lockedAt: null },
    });
  }
}

module.exports = PrismaVcaOutboxRepository;
