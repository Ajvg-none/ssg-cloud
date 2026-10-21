// backend/src/infrastructure/outbox/VcaOutboxWorker.js
// Consumidor del outbox transaccional de VCA.
const logger = require('../../config/logger');

class VcaOutboxWorker {
  constructor({ outboxRepo, warrantyRepo, vcaDelivery, batchSize = 10, maxAttempts = 5 }) {
    this.outboxRepo = outboxRepo;
    this.warrantyRepo = warrantyRepo;
    this.vcaDelivery = vcaDelivery;
    this.batchSize = batchSize;
    this.maxAttempts = maxAttempts;
  }

  async runOnce() {
    const stats = { claimed: 0, delivered: 0, retried: 0, failed: 0, backfilled: 0 };

    try {
      // Recupera jobs que quedaron PROCESSING por una caída del proceso.
      await this.outboxRepo.recoverStaleProcessing(new Date(Date.now() - 5 * 60 * 1000));
      stats.backfilled = await this.outboxRepo.backfillFromPendingWarranties({
        maxAttempts: this.maxAttempts,
      });

      const jobs = await this.outboxRepo.claimDue(this.batchSize);
      stats.claimed = jobs.length;

      for (const job of jobs) {
        const attempts = (job.attempts || 0) + 1;

        try {
          const warranty = await this.warrantyRepo.findWithRelationsById(job.warrantyId);
          if (!warranty) {
            await this.outboxRepo.markFailed(job.id, attempts, 'Garantía no encontrada');
            stats.failed += 1;
            continue;
          }

          if (warranty.requiresVca === false) {
            await this.outboxRepo.markDone(job.id);
            continue;
          }

          if (!warranty.lab?.vcaEnabled) {
            await this.outboxRepo.markFailed(job.id, attempts, 'vca_disabled');
            stats.failed += 1;
            continue;
          }

          const result = await this.vcaDelivery.deliver(
            warranty,
            warranty.store,
            warranty.lab
          );

          if (result.delivered) {
            await this.outboxRepo.markDone(job.id);
            stats.delivered += 1;
          } else {
            const message = result.error || result.skipped || 'Error desconocido de VCA';
            if (attempts >= this.maxAttempts) {
              await this.outboxRepo.markFailed(job.id, attempts, message);
              stats.failed += 1;
            } else {
              const delayMs = Math.min(60_000 * attempts, 15 * 60_000);
              await this.outboxRepo.markRetry(job.id, attempts, message, delayMs);
              stats.retried += 1;
            }
          }
        } catch (error) {
          const message = error.message || 'Error inesperado del worker';
          if (attempts >= this.maxAttempts) {
            await this.outboxRepo.markFailed(job.id, attempts, message);
            stats.failed += 1;
          } else {
            const delayMs = Math.min(60_000 * attempts, 15 * 60_000);
            await this.outboxRepo.markRetry(job.id, attempts, message, delayMs);
            stats.retried += 1;
          }
          logger.error(`[VcaOutboxWorker] Job ${job.id} falló: ${message}`);
        }
      }
    } catch (error) {
      logger.error(`[VcaOutboxWorker] Error en ciclo: ${error.message}`);
    }

    return stats;
  }
}

module.exports = VcaOutboxWorker;
