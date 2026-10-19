// backend/src/config/cors.js
// Resolución flexible de la lista blanca CORS.
//
// El backend sirve la SPA desde frontend/dist, así que las llamadas al API pueden
// ser same-origin (no requieren CORS) o cross-origin (dev con Vite, despliegues
// separados). Para no acoplar el arranque a un nombre concreto de variable se
// aceptan varias, con FRONTEND_URL como canónico.
const CANDIDATE_VARS = ['FRONTEND_URL', 'CORS_ORIGIN', 'CORS_ORIGINS', 'ALLOWED_ORIGINS'];

// Normaliza un origen/host: sin espacios, sin slash final, sin distinguir mayúsculas.
function normalize(value) {
  return (value || '').trim().replace(/\/+$/, '').toLowerCase();
}

// Separa por coma; la normalización real la hace normalize().
function parseOrigins(value) {
  return (value || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// Devuelve la primera variable configurada con orígenes válidos, ya normalizados.
function resolveAllowedOrigins(env = process.env) {
  for (const name of CANDIDATE_VARS) {
    const origins = [...new Set(parseOrigins(env[name]).map(normalize))];
    if (origins.length > 0) {
      return { allowedOrigins: origins, source: name };
    }
  }
  return { allowedOrigins: [], source: null };
}

function hostnameOf(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// Rangos de red local privada (RFC 1918): 10/8, 192.168/16, 172.16-31/12.
function isPrivateLanHost(hostname) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

// Origen de desarrollo: localhost, cualquier loopback (127.*) o cualquier IP de
// red privada, con cualquier puerto. Solo se usa fuera de producción.
function isLocalDevOrigin(origin) {
  const host = hostnameOf(origin);
  if (!host) return false;
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127\./.test(host) ||
    host === '[::1]' ||
    host === '::1' ||
    isPrivateLanHost(host)
  );
}

// ¿El origen coincide con el Host de la petición? Cubre la SPA servida por el
// propio backend y despliegues detrás de proxy donde Origin == Host.
function sameHost(origin, requestHost) {
  try {
    return normalize(new URL(origin).host) === normalize(requestHost);
  } catch {
    return false;
  }
}

// Permite: peticiones sin Origin (server-to-server, curl), la whitelist explícita
// (FRONTEND_URL + alias), el mismo origen que el Host y, fuera de producción,
// cualquier localhost o IP de red privada (LAN de desarrollo).
function isOriginAllowed(origin, { allowedOrigins = [], requestHost = '', nodeEnv = 'development' } = {}) {
  if (!origin) return true;

  const norm = normalize(origin);

  // Sin whitelist configurada se mantiene el comportamiento permisivo previo.
  if (allowedOrigins.length === 0) return true;

  if (allowedOrigins.includes(norm)) return true;
  if (requestHost && sameHost(norm, requestHost)) return true;

  if (nodeEnv !== 'production' && isLocalDevOrigin(norm)) return true;

  return false;
}

module.exports = {
  resolveAllowedOrigins,
  parseOrigins,
  isOriginAllowed,
  isLocalDevOrigin,
  isPrivateLanHost,
  normalize,
  sameHost,
  CANDIDATE_VARS,
};
