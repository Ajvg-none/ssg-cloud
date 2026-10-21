// backend/src/infrastructure/repositories/PrismaOrderCacheRepository.js
class PrismaOrderCacheRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async upsert(orderNumber, rawData) {
    return this.prisma.orderCache.upsert({
      where: { orderNumber },
      update: { rawData, updatedAt: new Date() },
      create: { orderNumber, rawData },
    });
  }
}

module.exports = PrismaOrderCacheRepository;
