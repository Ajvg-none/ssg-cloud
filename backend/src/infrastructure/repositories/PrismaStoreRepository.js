// backend/src/infrastructure/repositories/PrismaStoreRepository.js
class PrismaStoreRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findById(id) {
    return this.prisma.store.findUnique({ where: { id } });
  }

  async findByAccn(accn, excludeId = null) {
    return this.prisma.store.findFirst({
      where: { accn, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  async findManyWithLabAndCounts() {
    return this.prisma.store.findMany({
      include: {
        lab: { select: { id: true, name: true } },
        _count: { select: { warranties: true, users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findByLabIdActive(labId) {
    return this.prisma.store.findMany({
      where: { labId, active: true },
      select: { id: true, name: true, accn: true },
      orderBy: { name: 'asc' },
    });
  }

  async countByLabId(labId) {
    return this.prisma.store.count({ where: { labId } });
  }

  async create(data) {
    return this.prisma.store.create({ data });
  }

  async update(id, data) {
    return this.prisma.store.update({ where: { id }, data });
  }
}

module.exports = PrismaStoreRepository;
