// backend/src/controllers/adminUserController.js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
* Obtiene todos los usuarios del sistema.
*/
const getUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const where = {};
    if (search) where.username = { contains: search, mode: 'insensitive' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          active: true,
          storeId: true,
          labId: true,
          createdAt: true,
          store: { select: { id: true, name: true, accn: true } },
          lab: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getUsers] Error: ${error.message}`);
    return res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
};

/**
* Crea un nuevo usuario (TIENDA o LABORATORIO).
*/
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
    const existingUser = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
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
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) return res.status(400).json({ error: 'La tienda especificada no existe.' });
    }
    if (labId) {
      const lab = await prisma.lab.findUnique({ where: { id: labId } });
      if (!lab) return res.status(400).json({ error: 'El laboratorio especificado no existe.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        password: hashedPassword,
        role,
        storeId: storeId || null,
        labId: labId || null,
        active: true
      }
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
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    logger.error(`❌ Error en createUser: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
* Actualiza un usuario existente (username o estado activo).
*/
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, active } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const updateData = {};
    if (username !== undefined) {
      if (!username || username.trim() === '') {
        return res.status(400).json({ error: 'El nombre de usuario no puede estar vacío.' });
      }
      const userExists = await prisma.user.findFirst({
        where: { username: username.toLowerCase(), NOT: { id } }
      });
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
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });
    logger.info(`✅ Usuario actualizado por Admin: ${updatedUser.username}`);
    return res.status(200).json({
      message: 'Usuario actualizado exitosamente.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        active: updatedUser.active
      }
    });
  } catch (error) {
    logger.error(`❌ Error en updateUser: ${error.message}`);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
* ✅ NUEVO: Elimina un usuario PERMANENTEMENTE de la base de datos.
* Sin conflictos: ninguna tabla referencia a users (las garantías están
* ligadas a tiendas/laboratorios, no a usuarios).
* Protecciones: no se pueden eliminar usuarios ADMIN ni a uno mismo.
*/
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // ✅ Protección 1: el rol ADMIN nunca se elimina desde el panel
    if (user.role === 'ADMIN') {
      return res.status(403).json({ error: 'No se pueden eliminar usuarios con rol ADMIN.' });
    }

    // ✅ Protección 2: un admin no puede eliminarse a sí mismo
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }

    await prisma.user.delete({ where: { id } });

    logger.info(`🗑️ Usuario eliminado por Admin: ${user.username} (${user.role})`);
    return res.status(200).json({
      message: 'Usuario eliminado exitosamente.',
      user: { id: user.id, username: user.username, role: user.role }
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
  deleteUser
};