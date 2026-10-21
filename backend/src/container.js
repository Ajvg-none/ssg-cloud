// backend/src/container.js
// Composition root: única instancia de Prisma y cableado de dependencias.
const prisma = require('./config/prisma');

const PrismaWarrantyRepository = require('./infrastructure/repositories/PrismaWarrantyRepository');
const PrismaStoreRepository = require('./infrastructure/repositories/PrismaStoreRepository');
const PrismaLabRepository = require('./infrastructure/repositories/PrismaLabRepository');
const PrismaUserRepository = require('./infrastructure/repositories/PrismaUserRepository');
const PrismaOrderCacheRepository = require('./infrastructure/repositories/PrismaOrderCacheRepository');
const PrismaVcaOutboxRepository = require('./infrastructure/repositories/PrismaVcaOutboxRepository');

const GesvisionOrderAdapter = require('./infrastructure/adapters/GesvisionOrderAdapter');
const GesvisionProductAdapter = require('./infrastructure/adapters/GesvisionProductAdapter');
const EscPosTicketAdapter = require('./infrastructure/adapters/EscPosTicketAdapter');
const VcaDeliveryAdapter = require('./infrastructure/adapters/VcaDeliveryAdapter');

const CreateWarrantyUseCase = require('./application/warranty/CreateWarrantyUseCase');
const SyncOrderUseCase = require('./application/warranty/SyncOrderUseCase');
const VcaOutboxWorker = require('./infrastructure/outbox/VcaOutboxWorker');

const logger = require('./config/logger');

const warrantyRepo = new PrismaWarrantyRepository(prisma);
const storeRepo = new PrismaStoreRepository(prisma);
const labRepo = new PrismaLabRepository(prisma);
const userRepo = new PrismaUserRepository(prisma);
const orderCacheRepo = new PrismaOrderCacheRepository(prisma);
const outboxRepo = new PrismaVcaOutboxRepository(prisma);

const orderProvider = new GesvisionOrderAdapter();
const productCatalog = new GesvisionProductAdapter();
const ticketRenderer = new EscPosTicketAdapter();
const vcaDelivery = new VcaDeliveryAdapter();

const createWarrantyUseCase = new CreateWarrantyUseCase({
  warrantyRepo,
  storeRepo,
  productCatalog,
  outbox: outboxRepo,
  logger,
});

const syncOrderUseCase = new SyncOrderUseCase({ orderProvider, orderCacheRepo });

const maxAttempts = parseInt(process.env.VCA_MAX_ATTEMPTS, 10) || 5;
const vcaOutboxWorker = new VcaOutboxWorker({
  outboxRepo,
  warrantyRepo,
  vcaDelivery,
  batchSize: parseInt(process.env.VCA_OUTBOX_BATCH_SIZE, 10) || 10,
  maxAttempts,
});

module.exports = {
  prisma,
  repositories: {
    warrantyRepo,
    storeRepo,
    labRepo,
    userRepo,
    orderCacheRepo,
    outboxRepo,
  },
  adapters: {
    orderProvider,
    productCatalog,
    ticketRenderer,
    vcaDelivery,
  },
  useCases: {
    createWarrantyUseCase,
    syncOrderUseCase,
  },
  vcaOutboxWorker,
};
