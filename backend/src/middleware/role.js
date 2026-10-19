// backend/src/middleware/role.js

/**
 * Middleware de autorización por roles.
 * Verifica que el usuario autenticado tenga uno de los roles permitidos.
 * 
 * @param {Array<string>} allowedRoles - Array de roles permitidos (ej: ['ADMIN', 'TIENDA'])
 * @returns {Function} Middleware de Express
 * 
 * @example
 * // Solo ADMIN puede acceder
 * router.post('/users', authenticateToken, requireRole(['ADMIN']), createUser);
 * 
 * // ADMIN o TIENDA pueden acceder
 * router.get('/warranties', authenticateToken, requireRole(['ADMIN', 'TIENDA']), getWarranties);
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // 1. Verificar que el usuario esté autenticado (debe venir del middleware auth.js)
    if (!req.user) {
      return res.status(401).json({ 
        error: 'No autenticado. Debe iniciar sesión primero.' 
      });
    }

    // 2. Verificar que el usuario tenga un rol asignado
    if (!req.user.role) {
      return res.status(403).json({ 
        error: 'Usuario sin rol asignado.' 
      });
    }

    // 3. Verificar que el rol del usuario esté en la lista de roles permitidos
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Acceso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}. Tu rol actual: ${req.user.role}` 
      });
    }

    // 4. Si todo está bien, pasar al siguiente middleware o controlador
    next();
  };
};

module.exports = requireRole;