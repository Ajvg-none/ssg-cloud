// backend/scripts/backfill-responsibility.js
// ⚙️ ONE-SHOT: clasifica el responsable del error de TODAS las garantías
// históricas en función de warrantyType (utils/responsibility.js).
// Idempotente: solo toca registros con responsibleParty = null, y para el
// tipo de Lente (mapeo null) es un no-op: quedan "sin clasificar" para la
// Fase 2 (selector manual).
//
// Ejecutar UNA VEZ:  node scripts/backfill-responsibility.js
// (o: npm run backfill:responsibility)

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { deriveResponsibility } = require('../src/utils/responsibility');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TYPES = [
  'Error de Medida',
  'Error de Transcripcion',
  'Error de RX',
  'Error de Tipo de Lente (Material)',
];

async function main() {
  console.log('↩️  Backfill de responsable del error (solo responsibleParty IS NULL)...');
  let total = 0;
  for (const type of TYPES) {
    const responsible = deriveResponsibility(type);
    const result = await prisma.warranty.updateMany({
      where: { warrantyType: type, responsibleParty: null },
      data: {
        responsibleParty: responsible,
        responsibleSource: responsible ? 'AUTO' : null,
      },
    });
    console.log(`   ${type} → ${responsible ?? '(null: sin clasificar)'}: ${result.count} actualizadas`);
    total += result.count;
  }
  console.log(`✅ Listo. Total actualizadas: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
