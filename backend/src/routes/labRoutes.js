// backend/src/routes/labRoutes.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getTicketBuffer,
  markAsCompleted,
  getPrintConfig,
  getTestTicket,
  getMyLabWarranties,
  getMyStores,
} = require('../controllers/labController');

// Proteccion: solo LABORATORIO y ADMIN
router.use(authenticateToken);
router.use(requireRole(['LABORATORIO', 'ADMIN']));

// Buffer ESC/POS del ticket para impresion via QZ Tray (frontend)
router.get('/ticket-buffer/:warrantyId', getTicketBuffer);

// Ticket de prueba (lo imprime el frontend con QZ Tray)
router.get('/test-ticket', getTestTicket);

// Configuracion de impresion del laboratorio
router.get('/print-config', getPrintConfig);

// Confirmar que el ticket ya se imprimio (QZ Tray) y marcar COMPLETED
router.post('/warranties/:warrantyId/complete', markAsCompleted);

// Garantias del laboratorio
router.get('/warranties', getMyLabWarranties);

// Tiendas del laboratorio
router.get('/stores', getMyStores);

module.exports = router;
