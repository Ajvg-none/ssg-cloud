// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación.
 * Verifica la validez del token JWT en el header de autorización.
 */
const authenticateToken = (req, res, next) => {
  // 1. Obtener el header de autorización
  const authHeader = req.headers['authorization'];

  // 2. Verificar si el header existe y tiene el formato "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Si no hay token, se deniega el acceso inmediatamente
    return res.status(401).json({ 
      error: 'Acceso denegado. Se requiere un token de autenticación.' 
    });
  }

  // 3. Verificar la validez del token usando la clave secreta del .env
  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) {
      // Si el token está expirado o fue alterado, se deniega el acceso
      return res.status(403).json({ 
        error: 'Token inválido o expirado.' 
      });
    }

    // 4. ¡Éxito! El token es válido.
    // Adjuntamos la información decodificada al objeto de la petición (req)
    // Esto es lo que permitirá a los controladores saber quién hace la petición.
    req.user = {
      id: decodedUser.id,
      role: decodedUser.role,
      storeId: decodedUser.storeId,
      labId: decodedUser.labId
    };

    // 5. Pasar el control al siguiente middleware o al controlador de la ruta
    next();
  });
};

module.exports = authenticateToken;