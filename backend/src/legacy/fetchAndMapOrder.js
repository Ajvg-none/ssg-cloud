// backend/src/legacy/fetchAndMapOrder.js
const gesvisionApi = require('./gesvisionApi');
const { mapOpticalOrderV2ToV1 } = require('./opticalOrderV2Mapper');
const { getHistoricalUsdToVesRate } = require('../utils/exchangeRate'); // ✅ NUEVO
const logger = require('../config/logger');

// ✅ Alineado con el sistema en producción.
// 'L': 'DE LEJOS', 'C': 'DE CERCA' (nunca "MONOFOCAL")
const LENS_TYPE_MAP = { 'L': 'DE LEJOS', 'C': 'DE CERCA', 'B': 'BIFOCAL', 'P': 'PROGRESIVO' };
const productCache = new Map();

/**
 * Intenta inferir el tipo de lente desde la descripción de los ítems.
 * NUNCA devuelve "MONOFOCAL": lo convierte a DE LEJOS / DE CERCA.
 * @param {Array<Object>} items - Ítems normalizados.
 * @returns {string|null}
 */
function inferTipoLenteFromItems(items) {
  if (!items || items.length === 0) return null;
  const texto = items.map(i => (i.descripcion || '').toLowerCase()).join(' ');
  if (texto.includes('progresivo') || texto.includes('pro ') || texto.includes('balance')) return 'PROGRESIVO';
  if (texto.includes('bifocal')) return 'BIFOCAL';
  if (texto.includes('monofocal') || texto.includes('single vision') ||
      texto.includes('de lejos') || texto.includes('de cerca')) {
    if (texto.includes('cerca')) return 'DE CERCA';
    return 'DE LEJOS';
  }
  return null;
}

function getPupilHeight(order, eye) {
  const eyeKey = eye === 'OD' ? 'OD' : 'OI';
  const possibleRootFields = [`height${eyeKey}`, `pupilHeight${eyeKey}`, `verticalHeight${eyeKey}`, `eyeHeight${eyeKey}`, `pupillaryHeight${eyeKey}`, `alturaPupilar${eyeKey}`];
  for (const field of possibleRootFields) {
    if (order[field] !== undefined && order[field] !== null) return order[field];
  }
  const opticalData = order[`opticalData${eyeKey}`];
  if (opticalData) {
    const opticalFields = ['height', 'pupilHeight', 'verticalHeight', 'eyeHeight'];
    for (const field of opticalFields) {
      if (opticalData[field] !== undefined && opticalData[field] !== null) return opticalData[field];
    }
  }
  return null;
}

/**
 * Primera letra de un código de artículo ('' si viene vacío).
 * En GesVision v2 el código ya incluye la letra de tipo: M (montura),
 * H/C/B/A (cristal), E (estuche/accesorio), S, etc.
 * @param {*} code - Código de artículo.
 * @returns {string}
 */
function primeraLetra(code) {
  return String(code || '').trim().charAt(0).toUpperCase();
}

/**
 * Heurística por descripción: ¿es montura?
 * Se usa solo cuando la línea no trae `opticalRole`.
 * @param {*} descripcion - Descripción del ítem.
 * @returns {boolean}
 */
function describeAsMontura(descripcion) {
  const d = String(descripcion || '').toLowerCase();
  return d.includes('montura') || d.includes('armazon') || d.includes('armazón') || d.includes('frame');
}

/**
 * Heurística por descripción: ¿es cristal/lente?
 * Se usa solo cuando la línea no trae `opticalRole`.
 * @param {*} descripcion - Descripción del ítem.
 * @returns {boolean}
 */
function describeAsCristal(descripcion) {
  const d = String(descripcion || '').toLowerCase();
  return (
    d.includes('cristal') || d.includes('lente') || d.includes('lens') ||
    d.includes('progresivo') || d.includes('progressive') || d.includes('bifocal') ||
    d.includes('monofocal') || d.includes('varilux') || d.includes('essilor') ||
    d.includes('hi-in') || d.includes('hi in') || d.includes('balance') || d.includes('pro ')
  );
}

/**
 * Normaliza las líneas de una factura/pedido v2 (`InvoiceLineDocument` /
 * `OrderLineDocument`) al contrato interno de ítems.
 *
 * ⚠️ El código autoritativo de cada ítem es `line.productBarcode`: es el código
 * que GesVision muestra en la venta (M121603, H000014, E000063). El
 * `reference`/`barCode` del documento `/products/{id}` NO coincide con lo
 * vendido (devuelve el producto padre o una variante distinta: para la montura
 * MM2091 devolvía "S025624") y además añade una petición HTTP por línea.
 *
 * La clasificación montura/cristal se toma de `opticalRole` (FRAME | LENS) con
 * `opticalEye` (RIGHT | LEFT) como apoyo, y cae a la letra del código y a la
 * heurística por descripción cuando faltan esos metadatos (misma regla de
 * primera letra que `legacy/lensware.js`, que clasifica FRAM/LNAM así).
 *
 * `codigo_completo` NO vuelve a prefijarse: el código de v2 ya trae la letra de
 * tipo, y prefijar de nuevo producía duplicados como "MM113488".
 *
 * @param {Array<Object>} lines - Arreglo `lines` del documento de venta v2.
 * @returns {Promise<Array<Object>>}
 */
async function mapLineItems(lines) {
  const mappedItems = [];
  for (const line of lines) {
    // Descripción: la línea trae la del ítem vendido; el catálogo es último recurso.
    let descripcion = line.extendedDescription?.trim()
      || line.productDescription?.trim()
      || line.lineDescription?.trim()
      || line.productName?.trim()
      || null;

    // Código: barcode de la línea > catálogo (solo si falta).
    const barcode = String(line.productBarcode ?? '').trim();
    const productId = line.productId ?? line.product;

    let codigoArticulo = barcode || null;

    if (!codigoArticulo && !descripcion && productId) {
      let productData = productCache.get(productId);
      if (!productData) {
        try {
          const product = await gesvisionApi.getProduct(productId);
          productData = {
            description: product.description || product.name || product.extendedDescription || null,
            reference: product.reference || null,
            barCode: product.barCode || null
          };
          productCache.set(productId, productData);
        } catch (err) {
          logger.error(`Error al obtener producto ${productId}: ${err.message}`);
          productData = null;
        }
      }
      if (productData) {
        if (!descripcion) descripcion = productData.description;
        codigoArticulo = (productData.reference || productData.barCode || '').trim() || null;
      }
    }

    // Clasificación: metadatos de la línea (determinista) → letra del código → descripción.
    const role = String(line.opticalRole ?? '').toUpperCase();
    const letter = primeraLetra(codigoArticulo);
    const esMontura = role === 'FRAME'
      || (!role && (letter === 'M' || describeAsMontura(descripcion)));
    const esCristal = role === 'LENS'
      || (!role && (['A', 'B', 'H', 'C'].includes(letter) || describeAsCristal(descripcion)));

    if (!descripcion || descripcion.trim() === '') descripcion = 'Descripción no disponible';

    mappedItems.push({
      descripcion,
      cantidad: parseFloat(line.quantity) || 1,
      codigo_articulo: codigoArticulo,
      // v2 ya trae la letra de tipo en el código: no se prefija de nuevo.
      codigo_completo: codigoArticulo,
      es_montura: esMontura,
      es_cristal: esCristal,
      prefijo: letter
    });
  }
  return mappedItems;
}

/**
 * ✅ MODIFICADO: Obtiene los items + datos financieros de la orden v2.
 * Primero desde la factura de venta (`sales-invoices/{id}`),
 * luego desde el pedido de venta (`sales-orders/{id}`).
 *
 * Extrae:
 *  - items: líneas normalizadas
 *  - montoTotal: total de la factura (en moneda original)
 *  - monedaOriginal: currencyCode (USD, VES, etc.)
 *  - exchangeRate: tasa de cambio usada por GesVision en esa factura
 *  - totalSystem: total en moneda del sistema (si viene)
 *  - metodosPago: métodos de pago únicos
 *  - fechaVenta: fecha del documento (YYYY-MM-DD)
 *
 * @param {Object} order - Orden mapeada a forma v1.
 * @returns {Promise<Object>}
 */
async function fetchOrderItems(order) {
  let items = [];
  let montoTotal = null;
  let monedaOriginal = 'USD';
  let exchangeRate = 1;
  let totalSystem = null;
  let metodosPago = [];
  let fechaVenta = null;

  // 1. Intentar obtener datos desde la factura de venta
  if (order.issuedInvoiceId) {
    try {
      const invoice = await gesvisionApi.getSalesInvoice(order.issuedInvoiceId);
      if (invoice?.lines?.length) {
        items = await mapLineItems(invoice.lines);

        // ✅ NUEVO: Extraer datos financieros de la factura
        montoTotal = invoice.total ?? invoice.commercialTotalAmount ?? null;
        monedaOriginal = invoice.currencyCode || 'USD';
        exchangeRate = invoice.exchangeRate || 1;
        totalSystem = invoice.totalSystem ?? null;

        // Extraer métodos de pago únicos (ej: "Efectivo", "Tarjeta de Crédito")
        if (invoice.payments && Array.isArray(invoice.payments)) {
          const pagos = invoice.payments
            .map(p => p.paymentMethodName)
            .filter(Boolean);
          metodosPago = [...new Set(pagos)]; // Eliminar duplicados
        }

        // Extraer fecha de venta (solo la parte YYYY-MM-DD)
        fechaVenta = invoice.documentDate ? invoice.documentDate.split('T')[0] : null;

        logger.info(`[fetchOrderItems] Factura ${order.issuedInvoiceId}:`, {
          montoTotal,
          monedaOriginal,
          exchangeRate,
          totalSystem,
          fechaVenta,
          metodosPago
        });
      }
    } catch (err) {
      logger.error(`Error al obtener factura ${order.issuedInvoiceId}: ${err.message}`);
    }
  }

  // 2. Fallback a sales-orders si la factura viene vacía o falló
  if (items.length === 0 && order.issuedOrderId) {
    try {
      const salesOrder = await gesvisionApi.getSalesOrder(order.issuedOrderId);
      if (salesOrder?.lines?.length) {
        items = await mapLineItems(salesOrder.lines);
        // Si no teníamos fecha de la factura, intentar con la del pedido
        if (!fechaVenta && salesOrder.documentDate) {
          fechaVenta = salesOrder.documentDate.split('T')[0];
        }
      }
    } catch (err) {
      logger.error(`Error al obtener pedido ${order.issuedOrderId}: ${err.message}`);
    }
  }

  return { items, montoTotal, monedaOriginal, exchangeRate, totalSystem, metodosPago, fechaVenta };
}

/**
 * Resuelve el identificador de búsqueda a un objeto de orden en forma v1.
 * Busca por número/código (lista v2) y luego trae el detalle (con graduación).
 * @param {string|number} searchIdentifier
 * @returns {Promise<Object>}
 */
async function resolveOrder(searchIdentifier) {
  let listItem = null;
  try {
    logger.info(`Intentando buscar por Número de Orden: ${searchIdentifier}`);
    listItem = await gesvisionApi.getOpticalOrderByNumber(searchIdentifier);
  } catch (searchErr) {
    logger.warn(`⚠️ No encontrada por Número de Orden: ${searchIdentifier}. Intentando por ID interno...`);
  }

  let detail = null;
  if (listItem && listItem.id !== undefined && listItem.id !== null) {
    detail = await gesvisionApi.getOpticalOrder(listItem.id);
  } else {
    try {
      detail = await gesvisionApi.getOpticalOrder(searchIdentifier);
    } catch (err) {
      throw new Error(`No se pudo encontrar la orden con ID o Número: ${searchIdentifier}. Verifica que exista en GesVision.`);
    }
  }

  if (!detail) throw new Error(`Orden ${searchIdentifier} no encontrada`);
  return mapOpticalOrderV2ToV1(detail, listItem);
}

async function fetchAndMapOrder(searchIdentifier) {
  logger.info(` Iniciando mapeo de orden con identificador: ${searchIdentifier}`);
  const order = await resolveOrder(searchIdentifier);

  // ✅ NUEVO: Desestructuramos los nuevos campos financieros
  const { items, montoTotal, monedaOriginal, exchangeRate, totalSystem, metodosPago, fechaVenta } =
    await fetchOrderItems(order);

  // ✅ NUEVA LÓGICA: Conversión a USD usando el exchangeRate de GesVision
  let montoFinalUsd = null;

  if (montoTotal !== null) {
    // Prioridad 1: Si GesVision ya trajo el total en moneda del sistema, úsalo
    if (totalSystem !== null && totalSystem !== undefined) {
      montoFinalUsd = totalSystem;
      logger.info(`[fetchAndMapOrder] Usando totalSystem de GesVision: ${montoFinalUsd} USD`);
    }
    // Prioridad 2: Si la moneda es USD, no hay conversión
    else if (monedaOriginal === 'USD') {
      montoFinalUsd = montoTotal;
      logger.info(`[fetchAndMapOrder] Moneda USD, sin conversión: ${montoFinalUsd} USD`);
    }
    // Prioridad 3: Si es otra moneda (VES), dividir por el exchangeRate de GesVision
    else {
      montoFinalUsd = montoTotal / exchangeRate;
      logger.info(`[fetchAndMapOrder] Conversión: ${montoTotal} ${monedaOriginal} / ${exchangeRate} = ${montoFinalUsd} USD`);
    }
  }

  let tipoLente = null;
  const rawLensType = order.opticalDataOD?.lensType || order.opticalDataOI?.lensType;
  if (rawLensType && LENS_TYPE_MAP[rawLensType]) {
    tipoLente = LENS_TYPE_MAP[rawLensType];
    logger.info(`🔬 Tipo de lente desde GesVision: ${rawLensType} → ${tipoLente}`);
  } else {
    tipoLente = inferTipoLenteFromItems(items);
    if (tipoLente) logger.info(`🔬 Tipo de lente inferido desde items: ${tipoLente}`);
  }

  if (!tipoLente) {
    tipoLente = 'NO_DEFINIDO';
    logger.warn(`⚠️ No se pudo determinar el tipo de lente para orden ${searchIdentifier}`);
  }

  const mapDP = (opticalData, pupillaryDistanceTotal) => {
    const dpCentro = opticalData?.distancePupilCenter;
    const dpCerca = opticalData?.nearPupilCenter;
    if ((!dpCentro && dpCentro !== 0) && (!dpCerca && dpCerca !== 0)) {
      return { unico: pupillaryDistanceTotal || null, centro: null, cerca: null };
    }
    return { unico: null, centro: dpCentro, cerca: dpCerca };
  };
  const dpOD = mapDP(order.opticalDataOD, order.pupillaryDistance);
  const dpOI = mapDP(order.opticalDataOI, order.pupillaryDistance);

  let clienteNombre = order.customerName || null;
  if (!clienteNombre && order.customerId) {
    try {
      const customer = await gesvisionApi.getCustomer(order.customerId);
      if (customer) clienteNombre = [customer.name, customer.lastName].filter(Boolean).join(' ').trim() || null;
    } catch (custErr) {
      logger.error(`Error al obtener cliente ${order.customerId}: ${custErr.message}`);
    }
  }

  // v2 entrega el nombre de la tienda en la propia orden (no existe /warehouses en v2).
  const tiendaNombre = order.warehouseName || null;
  // v2 no expone /employees ni un ID de asesor: el usuario creador es la única fuente.
  const asesorNombre = order.createdBy || null;
  if (asesorNombre) {
    logger.info(`👔 Asesor/responsable de la venta: ${asesorNombre}`);
  } else {
    logger.warn(`⚠️ No se pudo determinar el asesor de la orden ${searchIdentifier}`);
  }

  return {
    orden_gesvision_id: order.id,
    orden_numero: String(order.number),
    codigo_completo: order.code || null,
    serial: order.serial || null,
    referencia_interna: order.reference || null,
    fecha_emision_origen: order.date ? new Date(order.date).toISOString() : new Date().toISOString(),
    od_esfera: order.opticalDataOD?.sphere ?? 0,
    od_cilindro: order.opticalDataOD?.cylinder || null,
    od_eje: order.opticalDataOD?.axis || null,
    od_adicion: order.opticalDataOD?.addition || null,
    od_dp_unico: dpOD.unico, od_dp_centro: dpOD.centro, od_dp_cerca: dpOD.cerca,
    oi_esfera: order.opticalDataOI?.sphere ?? 0,
    oi_cilindro: order.opticalDataOI?.cylinder || null,
    oi_eje: order.opticalDataOI?.axis || null,
    oi_adicion: order.opticalDataOI?.addition || null,
    oi_dp_unico: dpOI.unico, oi_dp_centro: dpOI.centro, oi_dp_cerca: dpOI.cerca,
    pupillary_distance_total: order.pupillaryDistance || null,
    average_distance_total: order.averageDistance || null,
    tipo_lente: tipoLente,
    altura_od: getPupilHeight(order, 'OD'),
    altura_oi: getPupilHeight(order, 'OI'),
    montura_horizontal: order.horizontal || null,
    montura_vertical: order.vertical || null,
    montura_puente: order.bridge || null,
    montura_diametro_max: order.maxDiameter || null,
    cliente_trae_montura: order.customerOwnFrame || false,
    estado_gesvision: order.status || null,
    issued_invoice_id: order.issuedInvoiceId || null,
    issued_order_id: order.issuedOrderId || null,
    cliente_nombre: clienteNombre,
    asesor_nombre: asesorNombre,
    tienda_nombre: tiendaNombre,
    warehouse_id: order.warehouseId || null,
    items: items,

    // ✅ NUEVO: Campos financieros agregados al contrato de salida
    monto_total_usd: montoFinalUsd !== null ? parseFloat(montoFinalUsd.toFixed(2)) : null,
    moneda_original: monedaOriginal,
    metodo_pago: metodosPago.length > 0 ? metodosPago.join(', ') : 'No especificado',
    fecha_venta: fechaVenta || null,
    exchange_rate: exchangeRate,
  };
}

module.exports = { fetchAndMapOrder };