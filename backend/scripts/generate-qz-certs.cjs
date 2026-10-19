// backend/scripts/generate-qz-certs.cjs
/**
 * Genera el par de credenciales para la firma digital de QZ Tray:
 *   keys/qz-private-key.pem  → clave privada (NUNCA se comparte, queda en el servidor)
 *   keys/qz-cert.pem         → certificado público
 *   keys/qz-cert.crt         → copia distribuible (Site Manager / override.crt de QZ Tray)
 *
 * Uso: npm run qz:genkeys
 * Si las claves ya existen, se conservan salvo que se use --force.
 */
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const keysDir = path.join(__dirname, '..', 'keys');
const privateKeyPath = path.join(keysDir, 'qz-private-key.pem');
const certPemPath = path.join(keysDir, 'qz-cert.pem');
const certCrtPath = path.join(keysDir, 'qz-cert.crt');
const force = process.argv.includes('--force');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

for (const file of [privateKeyPath, certPemPath, certCrtPath]) {
  if (fs.existsSync(file) && !force) {
    console.error(`❌ Ya existe ${path.basename(file)}. Usa --force para regenerar (tendrás que volver a confiar el certificado en cada PC).`);
    process.exit(1);
  }
}

console.log('🔑 Generando par RSA-2048 y certificado autofirmado (10 años)...');

(async () => {
  const pems = await selfsigned.generate(
    [
      { name: 'commonName', value: 'SGG Cloud' },
      { name: 'organizationName', value: 'SGG - Sistema de Garantias' },
    ],
    {
      keySize: 2048,
      days: 3650,
      algorithm: 'sha256',
    }
  );

  fs.writeFileSync(privateKeyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPemPath, pems.cert);
  fs.writeFileSync(certCrtPath, pems.cert);

  console.log('');
  console.log('✅ Credenciales generadas en backend/keys/:');
  console.log(`   - ${path.basename(privateKeyPath)}  (secreta: no commitear, no copiar a otros PCs)`);
  console.log(`   - ${path.basename(certPemPath)}  (pública, la sirve el backend)`);
  console.log(`   - ${path.basename(certCrtPath)}  (copia para confiar en QZ Tray)`);
  console.log('');
  console.log('➡️  Siguiente paso por cada PC con QZ Tray:');
  console.log('   Icono de bandeja → Advanced → Site Manager → arrastrar qz-cert.crt');
  console.log('   (o copiarlo como C:\\Program Files\\QZ Tray\\override.crt y reiniciar QZ Tray)');
})().catch((err) => {
  console.error('❌ Error generando credenciales:', err.message);
  process.exit(1);
});
