// backend/src/config/qzKeys.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Credenciales para la firma digital de QZ Tray (impresión silenciosa).
// Generarlas con: npm run qz:genkeys  (o copiarlas de otro servidor).
let cached = null;

function resolvePaths() {
  const keysDirDefault = path.join(__dirname, '..', '..', 'keys');
  return {
    privateKeyPath: process.env.QZ_PRIVATE_KEY_PATH || path.join(keysDirDefault, 'qz-private-key.pem'),
    certPath: process.env.QZ_CERT_PATH || path.join(keysDirDefault, 'qz-cert.pem'),
  };
}

/**
 * Carga y cachea el par clave/certificado. Devuelve null si no están
 * generadas todavía (la app sigue funcionando; QZ Tray mostrará sus diálogos).
 */
function loadKeys() {
  if (cached) return cached;

  const { privateKeyPath, certPath } = resolvePaths();

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(certPath)) {
    logger.warn('[qz] Credenciales QZ no encontradas. Ejecuta "npm run qz:genkeys" para impresión silenciosa.', {
      privateKeyPath,
      certPath,
    });
    return null;
  }

  try {
    const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
    const certificatePem = fs.readFileSync(certPath, 'utf8');
    // Validación temprana: si la clave es ilegible conviene saberlo al arrancar
    require('crypto').createPrivateKey(privateKeyPem);
    cached = { privateKeyPem, certificatePem };
    logger.info('[qz] Credenciales de firma QZ cargadas correctamente.');
    return cached;
  } catch (err) {
    logger.error(`[qz] Error cargando credenciales QZ: ${err.message}`);
    return null;
  }
}

module.exports = { loadKeys };
