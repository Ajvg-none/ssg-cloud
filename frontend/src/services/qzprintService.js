import qz from 'qz-tray';
import api from './api';

/**
 * Servicio para manejar la comunicación con QZ Tray
 */

// ============================================================
// FIRMA DIGITAL (impresión silenciosa)
// El backend firma cada petición con su clave privada
// (backend/keys/qz-private-key.pem). El certificado público
// debe estar confiado en QZ Tray de cada PC (Site Manager u
// override.crt).
//
// ⚠️ Si el servidor no tiene credenciales, /api/qz/certificate y
// /api/qz/sign responden 503 y QZ Tray ABORTA la impresión con
// "Failed to sign request" (no vuelve a mostrar sus diálogos).
// Por eso aquí se traduce ese 503 a un mensaje entendible.
// ============================================================

// Motivo legible cuando el servidor no puede firmar.
const SIGNING_503_MESSAGE =
  'El servidor no tiene credenciales de firma QZ configuradas (backend/keys). Avisa al administrador.';

/**
 * Traduce un error de los endpoints /api/qz/* a un mensaje legible.
 * @param {unknown} err - Error de axios.
 * @returns {string|null} Mensaje o null si no es un caso conocido.
 */
const describeSigningError = (err) => {
  if (err?.response?.status === 503) return SIGNING_503_MESSAGE;
  return null;
};

// Último error de firma conocido (para explicar el fallo de impresión).
let lastSigningError = null;

qz.security.setCertificatePromise((resolve, reject) => {
  api
    .get('/qz/certificate')
    .then((res) => {
      lastSigningError = null;
      resolve(res.data.certificate);
    })
    .catch((err) => {
      lastSigningError = describeSigningError(err) || err;
      console.error('❌ No se pudo obtener el certificado QZ del servidor:', err);
      reject(err);
    });
});

qz.security.setSignatureAlgorithm('SHA512'); // QZ Tray >= 2.1

qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
  api
    .get('/qz/sign', { params: { request: toSign } })
    .then((res) => {
      lastSigningError = null;
      resolve(res.data.signature);
    })
    .catch((err) => {
      lastSigningError = describeSigningError(err) || err;
      console.error('❌ El servidor no pudo firmar la petición QZ:', err);
      reject(err);
    });
});

/**
 * Verifica que el servidor pueda firmar ANTES de intentar imprimir,
 * para mostrar un error claro en lugar de "Failed to sign request".
 * @returns {Promise<true>}
 */
export const checkQzSigning = async () => {
  try {
    const res = await api.get('/qz/certificate');
    if (!res.data?.certificate) throw new Error('Certificado QZ vacío en la respuesta.');
    return true;
  } catch (err) {
    throw new Error(
      describeSigningError(err) ||
        'No se pudo obtener el certificado de firma QZ del servidor.'
    );
  }
};

// Verifica si QZ Tray está activo
export const isQZActive = () => {
  return typeof qz !== 'undefined' && qz.websocket.isActive();
};

// Conecta con QZ Tray
export const connectQZ = async () => {
  if (isQZActive()) return true;
  
  try {
    await qz.websocket.connect();
    console.log('✅ Conectado a QZ Tray');
    return true;
  } catch (err) {
    console.error('❌ Error conectando a QZ Tray:', err);
    throw new Error('No se pudo conectar con QZ Tray. Asegúrate de que esté ejecutándose.');
  }
};

// Imprime datos RAW (ESC/POS)
export const printRawData = async (printerName, base64Data) => {
  if (!isQZActive()) {
    await connectQZ();
  }

  // Sin credenciales en el servidor la firma falla y QZ aborta con un error
  // opaco ("Failed to sign request"): se avisa antes con un mensaje claro.
  try {
    await checkQzSigning();
  } catch (signErr) {
    throw new Error(signErr.message);
  }

  // Configuración de la impresora
  const config = qz.configs.create(printerName, {
    // encoding: 'hex' es necesario si enviamos hex, pero aquí usaremos base64 directo
  });

  // QZ Tray acepta base64 directamente si especificamos el formato
  const data = [
    {
      type: 'raw',
      format: 'base64',
      data: base64Data
    }
  ];

  try {
    await qz.print(config, data);
    console.log(`🖨️ Impresión enviada a ${printerName}`);
    return true;
  } catch (err) {
    console.error('❌ Error al imprimir:', err);
    // Si QZ falló por la firma, devolvemos el motivo real del servidor.
    if (lastSigningError && /sign/i.test(err?.message || '')) {
      throw new Error(
        typeof lastSigningError === 'string'
          ? lastSigningError
          : 'No se pudo firmar la petición con el servidor. Revisa las credenciales QZ.'
      );
    }
    throw err;
  }
};