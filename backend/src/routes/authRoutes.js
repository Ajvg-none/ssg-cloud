// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { login, me } = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me (requiere token)
router.get('/me', authenticateToken, me);

module.exports = router;
