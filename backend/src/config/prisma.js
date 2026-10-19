// backend/src/config/prisma.js
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Pool de conexiones compartido
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Driver adapter de Prisma v7
const adapter = new PrismaPg(pool);

// Instancia única de Prisma (singleton)
// La usaremos en el middleware y rutas nuevas del agente local.
const prisma = new PrismaClient({ adapter });

module.exports = prisma;