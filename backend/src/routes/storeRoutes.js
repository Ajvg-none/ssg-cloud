// backend/src/routes/storeRoutes.js
const express = require('express');
const router = express.Router();

// Middlewares de seguridad
const authenticateToken = require('../middleware/auth');
const requireRole = require('../middleware/role');

// Controladores
const {
  getOrder,
  createWarranty,
  getMyWarranties,
  getWarrantyDetail,
  getTicketBuffer,
  completeWarranty,
} = require('../controllers/storeController');

// 🔒 PROTECCIÓN GLOBAL: aplica a TODAS las rutas de este router
router.use(authenticateToken);
router.use(requireRole(['TIENDA']));

// --- Rutas existentes (Fase 4) ---
router.get('/order/:orderNumber', getOrder);
router.post('/warranties', createWarranty);

// --- Rutas nuevas (Fase 5 - RF-03) ---
router.get('/warranties', getMyWarranties);
router.get('/warranties/:id', getWarrantyDetail);

// --- ✅ NUEVO: Auto-impresión del ticket desde tienda ---
// Genera el buffer ESC/POS para imprimir con QZ Tray (el VCA lo entrega el agente local)
router.get('/ticket-buffer/:warrantyId', getTicketBuffer);
// Confirma que el ticket se imprimió y marca la garantía COMPLETED
router.post('/warranties/:warrantyId/complete', completeWarranty);

module.exports = router;