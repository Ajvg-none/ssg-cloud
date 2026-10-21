// backend/src/infrastructure/repositories/PrismaLabRepository.js
class PrismaLabRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findById(id) {
    return this.prisma.lab.findUnique({ where: { id } });
  }

  async findPrinterName(id) {
    return this.prisma.lab.findUnique({
      where: { id },
      select: { printerName: true },
    });
  }

  async findPrintConfig(id) {
    return this.prisma.lab.findUnique({
      where: { id },
      select: { printerName: true, vcaNetworkPath: true, vcaEnabled: true },
    });
  }

  async findWithCounts() {
    return this.prisma.lab.findMany({
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
        _count: { select: { stores: true, warranties: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(data) {
    return this.prisma.lab.create({ data });
  }

  async update(id, data) {
    return this.prisma.lab.update({ where: { id }, data });
  }

  async delete(id) {
    return this.prisma.lab.delete({ where: { id } });
  }
}

module.exports = PrismaLabRepository;
