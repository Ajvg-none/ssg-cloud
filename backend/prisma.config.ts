import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  // 👇 AGREGA ESTA SECCIÓN PARA EL SEED
  migrations: {
    seed: 'node prisma/seed.js',
  },
});