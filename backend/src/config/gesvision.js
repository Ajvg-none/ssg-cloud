require('dotenv').config();

// Base v1: contiene /auth/signin (el JWT HS512 que devuelve sirve también para /api/v2/).
const apiUrl = process.env.GESVISION_URL || 'https://app.gesvision.com/gesmo/rest/api';

/**
 * Deriva la base de la API v2 a partir del origin de la URL v1.
 * La v2 NO vive bajo /gesmo/rest/api (esa variante da 404): es {origin}/api/v2.
 * @param {string} base - URL base v1 (configurada o por defecto).
 * @returns {string}
 */
function deriveApiV2Url(base) {
  try {
    return `${new URL(base).origin}/api/v2`;
  } catch {
    return 'https://app.gesvision.com/api/v2';
  }
}

module.exports = {
  apiUrl,
  apiV2Url: process.env.GESVISION_API_V2_URL || deriveApiV2Url(apiUrl),
  user: process.env.GESVISION_USER || 'tu_usuario',
  password: process.env.GESVISION_PASS || 'tu_contraseña'
};
