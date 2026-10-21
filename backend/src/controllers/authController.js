// backend/src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { repositories } = require('../container');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username y contraseña son obligatorios.',
      });
    }

    const user = await repositories.userRepo.findByUsername(username.toLowerCase());

    if (!user) {
      logger.warn(`Intento de login fallido: username no encontrado (${username})`);
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    if (!user.active) {
      logger.warn(`Intento de login fallido: usuario inactivo (${username})`);
      return res.status(401).json({
        error: 'Cuenta desactivada. Contacta al administrador.',
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      logger.warn(`Intento de login fallido: contraseña incorrecta (${username})`);
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.storeId,
      labId: user.labId,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });

    logger.info(`✅ Login exitoso: ${username} (${user.role})`);

    return res.status(200).json({
      message: 'Login exitoso.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        storeId: user.storeId,
        labId: user.labId,
      },
    });
  } catch (error) {
    logger.error(`❌ Error en login: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const me = async (req, res) => {
  try {
    const user = await repositories.userRepo.findByIdWithRelations(req.user.id);
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
