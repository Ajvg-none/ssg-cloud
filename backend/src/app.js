// backend/src/app.js
// Fábrica de la aplicación Express (sin listen ni crons) para poder testearla.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const logger = require('./config/logger');

const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const labRoutes = require('./routes/labRoutes');
const adminRoutes = require('./routes/adminRoutes');
const qzRoutes = require('./routes/qzRoutes');
const categoryRoutes = require('./routes/categoryRoutes');

const { resolveAllowedOrigins, isOriginAllowed } = require('./config/cors');

function createApp() {
  const app = express();
  const NODE_ENV = process.env.NODE_ENV || 'development';

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const { allowedOrigins, source: corsSource } = resolveAllowedOrigins();

  if (corsSource) {
    logger.info(`[CORS] Whitelist activa desde ${corsSource}: ${allowedOrigins.join(', ')}`);
  } else {
    logger.info('[CORS] Sin whitelist configurada; CORS abierto.');
  }
  if (NODE_ENV !== 'production') {
    logger.info('[CORS] Modo no-productivo: se permiten orígenes localhost y de red privada.');
  }

  app.use((req, res, next) => {
    if (
      isOriginAllowed(req.headers.origin, {
        allowedOrigins,
        requestHost: req.headers.host,
        nodeEnv: NODE_ENV,
      })
    ) {
      return next();
    }
    logger.warn(`[CORS] Origen bloqueado: ${req.headers.origin} (Host: ${req.headers.host})`);
    return res.status(403).json({ error: 'Origen no permitido por CORS' });
  });

  app.use(cors({ origin: true }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
  });
  app.use('/api/auth/login', loginLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/store', storeRoutes);
  app.use('/api/lab', labRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/qz', qzRoutes);
  app.use('/api/warranty-categories', categoryRoutes);

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'SGG Backend', uptime: process.uptime() });
  });

  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  app.use((err, req, res, next) => {
    logger.error(`[Route Error] ${err.message}`, { stack: err.stack, path: req.path });
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

module.exports = { createApp };
