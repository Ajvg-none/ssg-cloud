// backend/src/infrastructure/repositories/PrismaUserRepository.js
class PrismaUserRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByUsername(username) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdWithRelations(id) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        labId: true,
        active: true,
        store: { select: { id: true, name: true, accn: true } },
        lab: { select: { id: true, name: true } },
      },
    });
  }

  async findMany({ search, page = 1, limit = 20 }) {
    const where = {};
    if (search) where.username = { contains: search, mode: 'insensitive' };

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          active: true,
          storeId: true,
          labId: true,
          createdAt: true,
          store: { select: { id: true, name: true, accn: true } },
          lab: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { total, users, page: parseInt(page, 10), limit: take };
  }

  async existsUsername(username, excludeId = null) {
    return this.prisma.user.findFirst({
      where: { username, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
  }

  async create(data) {
    return this.prisma.user.create({ data });
  }

  async update(id, data) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async updatePassword(id, password) {
    return this.prisma.user.update({ where: { id }, data: { password } });
  }

  async delete(id) {
    return this.prisma.user.delete({ where: { id } });
  }
}

module.exports = PrismaUserRepository;
