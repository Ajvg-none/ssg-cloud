// backend/src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const requireRole = require('../middleware/role');

// 1. Importar desde adminController (Labs, Stores, Dashboard)
const {
  createLab, getLabs, updateLab, deleteLab, regenerateLabApiKey,
  createStore, getStores, updateStore,
  resetUserPassword,
  getWarrantiesDashboard,
  unlockWarranty,
} = require('../controllers/adminController');

// 2. Importar desde adminUserController (Gestión de Usuarios)
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/adminUserController');

// 🔒 PROTECCIÓN GLOBAL: Solo ADMIN
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

// ============================================================
// RUTAS DE LABORATORIOS
// ============================================================
router.get('/labs', getLabs);
router.post('/labs', createLab);
router.put('/labs/:id', updateLab);
router.delete('/labs/:id', deleteLab);
router.post('/labs/:id/regenerate-key', regenerateLabApiKey);

// ============================================================
// RUTAS DE TIENDAS
// ============================================================
router.get('/stores', getStores);
router.post('/stores', createStore);
router.put('/stores/:id', updateStore);

// ============================================================
// RUTAS DE USUARIOS
// ============================================================
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser); // ✅ NUEVO: eliminar usuario de la BD
router.post('/users/:userId/reset-password', resetUserPassword);

// ============================================================
// DASHBOARD DE GARANTÍAS
// ============================================================
router.get('/warranties', getWarrantiesDashboard);
// Desbloquear/reprocesar una garantía (solo ADMIN)
router.post('/warranties/:id/unlock', unlockWarranty);

module.exports = router;