// backend/src/routes/qzRoutes.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../config/logger');
const { loadKeys } = require('../config/qzKeys');

/**
 * Endpoints públicos que usa el frontend para firmar peticiones a QZ Tray
 * e imprimir sin diálogos de confirmación.
 *
 * - El certificado es información pública.
 * - /sign solo firma hashes opacos que envía qz-tray.js; la firma no tiene
 *   valor para terceros salvo que posean este mismo certificado confiable,
 *   por lo que no requiere JWT (patrón oficial de QZ Tray).
 */

router.get('/certificate', (req, res) => {
  const keys = loadKeys();
  if (!keys) {
    return res.status(503).json({ error: 'Credenciales QZ no configuradas en el servidor.' });
  }
  return res.json({ certificate: keys.certificatePem });
});

router.get('/sign', (req, res) => {
  const toSign = req.query.request;
  if (!toSign || typeof toSign !== 'string') {
    return res.status(400).json({ error: 'Falta el parámetro request.' });
  }
  if (toSign.length > 4096) {
    return res.status(400).json({ error: 'Parámetro request demasiado largo.' });
  }

  const keys = loadKeys();
  if (!keys) {
    return res.status(503).json({ error: 'Credenciales QZ no configuradas en el servidor.' });
  }

  try {
    // QZ Tray >= 2.1 firma con SHA512 sobre el hash recibido
    const signer = crypto.createSign('SHA512');
    signer.update(toSign);
    const signature = signer.sign(keys.privateKeyPem).toString('base64');
    return res.json({ signature });
  } catch (error) {
    logger.error(`[qz/sign] Error firmando petición: ${error.message}`);
    return res.status(500).json({ error: 'Error al firmar la petición.' });
  }
});

module.exports = router;
