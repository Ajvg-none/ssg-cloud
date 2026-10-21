// backend/src/controllers/adminUserController.js
// Adaptador HTTP delgado para usuarios.
const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { repositories } = require('../container');

const getUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const result = await repositories.userRepo.findMany({ search, page, limit });

    return res.status(200).json({
      users: result.users,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    logger.error(`[getUsers] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, role, storeId, labId } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Usuario, contraseña y rol son obligatorios.' });
    }
    const validRoles = ['TIENDA', 'LABORATORIO'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${validRoles.join(', ')}` });
    }
    if (role === 'ADMIN') {
      return res.status(403).json({ error: 'No se pueden crear usuarios ADMIN desde esta interfaz.' });
    }

    const existingUser = await repositories.userRepo.findByUsername(username.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
    }
    if (role === 'TIENDA' && !storeId) {
      return res.status(400).json({ error: 'Los usuarios TIENDA deben estar asociados a una tienda (storeId).' });
    }
    if (role === 'LABORATORIO' && !labId) {
      return res.status(400).json({ error: 'Los usuarios LABORATORIO deben estar asociados a un laboratorio (labId).' });
    }
    if (storeId) {
      const store = await repositories.storeRepo.findById(storeId);
      if (!store) return res.status(400).json({ error: 'La tienda especificada no existe.' });
    }
    if (labId) {
      const lab = await repositories.labRepo.findById(labId);
      if (!lab) return res.status(400).json({ error: 'El laboratorio especificado no existe.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await repositories.userRepo.create({
      username: username.toLowerCase(),
      password: hashedPassword,
      role,
      storeId: storeId || null,
      labId: labId || null,
      active: true,
    });
    logger.info(`✅ Usuario creado por Admin: ${newUser.username} (${role})`);
    return res.status(201).json({
      message: 'Usuario creado exitosamente.',
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        storeId: newUser.storeId,
        labId: newUser.labId,
        active: newUser.active,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    logger.error(`❌ Error en createUser: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, active } = req.body;

    const existingUser = await repositories.userRepo.findById(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const updateData = {};
    if (username !== undefined) {
      if (!username || username.trim() === '') {
        return res.status(400).json({ error: 'El nombre de usuario no puede estar vacío.' });
      }
      const userExists = await repositories.userRepo.existsUsername(username.toLowerCase(), id);
      if (userExists) {
        return res.status(409).json({ error: 'Ya existe otro usuario con ese nombre de usuario.' });
      }
      updateData.username = username.toLowerCase();
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'El campo active debe ser un booleano (true/false).' });
      }
      updateData.active = active;
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    const updatedUser = await repositories.userRepo.update(id, updateData);
    logger.info(`✅ Usuario actualizado por Admin: ${updatedUser.username}`);
    return res.status(200).json({
      message: 'Usuario actualizado exitosamente.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        active: updatedUser.active,
      },
    });
  } catch (error) {
    logger.error(`❌ Error en updateUser: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await repositories.userRepo.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    if (user.role === 'ADMIN') {
      return res.status(403).json({ error: 'No se pueden eliminar usuarios con rol ADMIN.' });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }

    await repositories.userRepo.delete(id);
    logger.info(`🗑️ Usuario eliminado por Admin: ${user.username} (${user.role})`);
    return res.status(200).json({
      message: 'Usuario eliminado exitosamente.',
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    logger.error(`❌ Error en deleteUser: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
};
