// backend/src/routes/categoryRoutes.js
//
// GET /api/warranty-categories — catálogo de categorías de garantía.
// Fuente única: warrantyCategories/ (DIP). Disponible para cualquier usuario
// autenticado (TIENDA la usa en el formulario; LAB/ADMIN en filtros).
// Agregar una categoría futura NO toca este archivo: aparece sola en la API.
const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/auth');
const { listCategories, DEFAULT_CATEGORY } = require('../warrantyCategories');
const logger = require('../config/logger');

// 🔒 Autenticación global del router (sin restricción de rol — catálogo común)
router.use(authenticateToken);

router.get('/', (req, res) => {
  const categories = listCategories();
  logger.info('[warranty-categories] Catálogo servido', {
    userId: req.user.id,
    role: req.user.role,
    count: categories.length,
  });
  return res.status(200).json({ categories, defaultCategory: DEFAULT_CATEGORY });
});

module.exports = router;
