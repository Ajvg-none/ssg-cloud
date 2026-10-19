// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed mínimo...');

  // === ÚNICAMENTE USUARIO ADMIN ===
  const adminHash = await bcrypt.hash('admin123', 10);
  
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {}, // Si ya existe, no hace nada
    create: {
      username: 'admin',
      password: adminHash,
      role: 'ADMIN',
      active: true,
    },
  });
  
  console.log('✅ Usuario Admin creado: admin / admin123');
  console.log('\n🎉 Seed completado. La base de datos está lista con el administrador.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });