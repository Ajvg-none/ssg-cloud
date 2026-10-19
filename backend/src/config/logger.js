const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Crear carpeta de logs si no existe
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Rotación diaria: un archivo por día, comprimido, con retención limitada
const LOG_RETENTION_DAYS = process.env.LOG_RETENTION_DAYS || 14;

const fileRotateTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'sgg-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: `${LOG_RETENTION_DAYS}d`,
  auditFile: path.join(logDir, 'sgg-log-audit.json'),
});

const errorRotateTransport = new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: 'sgg-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: `${LOG_RETENTION_DAYS}d`,
  auditFile: path.join(logDir, 'sgg-error-log-audit.json'),
});

fileRotateTransport.on('error', (err) => {
  // Evitar que un fallo de disco derribe el proceso; winston ya lo ignora, dejamos rastro en consola
  console.error('[logger] Error en transporte de fichero:', err.message);
});

errorRotateTransport.on('error', (err) => {
  console.error('[logger] Error en transporte de errores:', err.message);
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sgg-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    errorRotateTransport,
    fileRotateTransport,
  ],
});

module.exports = logger;
