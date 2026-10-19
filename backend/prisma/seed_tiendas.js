// prisma/seed_tiendas.js
const path = require('path');

// 1. Cargar variables de entorno explícitamente
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR FATAL: No se encontró DATABASE_URL en el archivo .env');
  process.exit(1);
}

// 2. Importar el adaptador y el driver de la base de datos (PostgreSQL)
// ⚠️ IMPORTANTE: Si usas MySQL, cambia estas 2 líneas por:
// const { PrismaMySQL } = require('@prisma/adapter-mysql');
// const { createPool } = require('mysql2');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// 3. Configurar el Pool de conexiones y el Adaptador
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool); // Usa PrismaMySQL si estás en MySQL

// 4. Instanciar PrismaClient PASANDO el adaptador (esto soluciona el error de inicialización)
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Iniciando creación de usuarios de tiendas...\n');

  // 5. Encriptar la contraseña genérica
  const genericPassword = '123456';
  const hashedPassword = await bcrypt.hash(genericPassword, 10);
  console.log('🔑 Contraseña genérica encriptada con bcrypt.\n');

  // 6. Buscar el archivo de usuarios en la carpeta padre (backend)
  const filePath = path.join(__dirname, '..', 'usuarios_tiendas_opticolor.txt');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: No se encontró el archivo 'usuarios_tiendas_opticolor.txt' en: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const usernames = fileContent
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0);

  console.log(`📄 Se encontraron ${usernames.length} usuarios en el archivo.`);

  // 7. Obtener todas las tiendas existentes y crear un mapa de relación
  // ⚠️ CORRECCIÓN: En Prisma los modelos se llaman en singular (store), no en plural (stores).
  const stores = await prisma.store.findMany({
    select: { id: true, name: true }
  });
  
  const storeMap = new Map();
  for (const store of stores) {
    // Normalizar: minúsculas, quitar espacios y caracteres especiales
    // Ej: "Puente Cristal" -> "puentecristal" -> "puentecristal_opticolor"
    const normalized = store.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const expectedUsername = `${normalized}_opticolor`;
    storeMap.set(expectedUsername, store);
  }

  const usersToInsert = [];
  const notFoundStores = [];

  for (const username of usernames) {
    const store = storeMap.get(username);
    if (store) {
      usersToInsert.push({
        username: username,
        password: hashedPassword,
        role: 'TIENDA',
        storeId: store.id,
        active: true,
      });
    } else {
      notFoundStores.push(username);
    }
  }

  // 8. Insertar en la base de datos (evita errores si ya existen)
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const user of usersToInsert) {
    try {
      // ⚠️ CORRECCIÓN: En Prisma los modelos se llaman en singular (user), no en plural (users).
      const existing = await prisma.user.findUnique({ where: { username: user.username } });
      
      if (existing) {
        // Si ya existe, actualizamos su storeId por si acaso, pero NO tocamos su contraseña actual
        await prisma.user.update({
          where: { username: user.username },
          data: { storeId: user.storeId, role: 'TIENDA', active: true }
        });
        updatedCount++;
      } else {
        // Si no existe, lo creamos
        await prisma.user.create({ data: user });
        createdCount++;
      }
    } catch (error) {
      console.warn(`⚠️ No se pudo procesar el usuario ${user.username}:`, error.message);
      skippedCount++;
    }
  }

  // 9. Reporte final
  console.log('\n✅ --- RESUMEN ---');
  console.log(`✅ Usuarios creados: ${createdCount}`);
  console.log(`🔄 Usuarios existentes actualizados: ${updatedCount}`);
  
  if (skippedCount > 0) {
    console.log(`⚠️ Usuarios omitidos por error: ${skippedCount}`);
  }
  
  if (notFoundStores.length > 0) {
    console.warn(`\n⚠️ ATENCIÓN: No se encontraron tiendas en la BD para estos ${notFoundStores.length} usuarios:`);
    notFoundStores.forEach(u => console.warn(`   - ${u}`));
    console.warn('   (Estos usuarios fueron omitidos. Asegúrate de que el nombre de la tienda en la BD coincida con el prefijo del usuario).');
  } else {
    console.log('🎉 ¡Todos los usuarios del archivo tienen una tienda asociada en la BD!');
  }
  
  console.log(`\n🔑 Contraseña para todos los usuarios nuevos: ${genericPassword}`);
}

main()
  .catch(e => {
    console.error('❌ Error ejecutando el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Cerrar el pool de conexiones del adaptador para liberar recursos
    if (pool) {
      await pool.end();
    }
  });