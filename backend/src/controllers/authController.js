// backend/src/controllers/authController.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

// Configurar Prisma con driver adapter (Prisma v7)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Controlador de login de usuarios.
 * Valida credenciales y genera un JWT.
 * 
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Validar que se envíen username y password
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username y contraseña son obligatorios.' 
      });
    }

    // 2. Buscar usuario por username
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() } 
    });

    if (!user) {
      logger.warn(`Intento de login fallido: username no encontrado (${username})`);
      return res.status(401).json({ 
        error: 'Credenciales inválidas.' 
      });
    }

    // 3. Verificar que el usuario esté activo
    if (!user.active) {
      logger.warn(`Intento de login fallido: usuario inactivo (${username})`);
      return res.status(401).json({ 
        error: 'Cuenta desactivada. Contacta al administrador.' 
      });
    }

    // 4. Comparar contraseña con bcrypt
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      logger.warn(`Intento de login fallido: contraseña incorrecta (${username})`);
      return res.status(401).json({ 
        error: 'Credenciales inválidas.' 
      });
    }

    // 5. Generar JWT con datos del usuario
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.storeId,
      labId: user.labId
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h' // Token válido por 24 horas
    });

    logger.info(`✅ Login exitoso: ${username} (${user.role})`);

    // 6. Responder con token y datos del usuario (sin password)
    return res.status(200).json({
      message: 'Login exitoso.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        storeId: user.storeId,
        labId: user.labId
      }
    });

  } catch (error) {
    logger.error(`❌ Error en login: ${error.message}`);
    return res.status(500).json({ 
      error: 'Error interno del servidor.' 
    });
  }
};

const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        labId: true,
        active: true,
        store: { select: { id: true, name: true, accn: true } },
        lab: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    logger.error(`❌ Error en me: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { login, me };