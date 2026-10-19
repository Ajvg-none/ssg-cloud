// backend/src/legacy/printer.js
const escpos = require('escpos');
const logger = require('../config/logger');
const LINE_WIDTH = 39;

// ============================================================
// FUNCIONES DE FORMATEO
// ============================================================
function padRight(str, width) { return String(str).padEnd(width, ' '); }
function padLeft(str, width) { return String(str).padStart(width, ' '); }
function wrapText(text, maxLength) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  words.forEach(word => {
    if (!word) return;
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      let remainingWord = word;
      while (remainingWord.length > maxLength) {
        lines.push(remainingWord.substring(0, maxLength));
        remainingWord = remainingWord.substring(maxLength);
      }
      currentLine = remainingWord;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}
function formatEsfCil(value) {
  if (value === null || value === undefined) return '      ';
  const num = parseFloat(value);
  if (isNaN(num)) return '      ';
  const sign = num >= 0 ? '+' : '';
  return padLeft(`${sign}${num.toFixed(2)}`, 6);
}
function formatInt(value, width) {
  if (value === null || value === undefined) return padLeft('', width);
  const num = parseInt(value);
  if (isNaN(num)) return padLeft('', width);
  return padLeft(num.toString(), width);
}
function formatDP(value) {
  if (value === null || value === undefined) return '    ';
  const num = parseFloat(value);
  if (isNaN(num)) return '    ';
  const str = num % 1 === 0 ? `${num}. ` : `${num}`;
  return padRight(str, 4);
}

// ============================================================
// GENERACIÓN DE TICKET TEXTO
// ============================================================
function generateTicketText(order, items) {
  const safeItems = Array.isArray(items) ? items : [];
  // Variables principales (sin duplicaciones)
  const codigoCompleto = order.codigo_completo || '';
  const sucursal = order.tienda_nombre || '';
  const fechaImpresion = new Date().toLocaleString('es-ES', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).replace(',', '');
  const odEsf = formatEsfCil(order.od_esfera);
  const odCil = formatEsfCil(order.od_cilindro);
  const odEje = formatInt(order.od_eje, 3);
  const odAdd = formatEsfCil(order.od_adicion);
  const odDp = formatDP(order.od_dp_cerca ?? order.od_dp_centro);
  const oiEsf = formatEsfCil(order.oi_esfera);
  const oiCil = formatEsfCil(order.oi_cilindro);
  const oiEje = formatInt(order.oi_eje, 3);
  const oiAdd = formatEsfCil(order.oi_adicion);
  const oiDp = formatDP(order.oi_dp_cerca ?? order.oi_dp_centro);
  const tipoLente = order.tipo_lente || '';
  const alturaOD = order.altura_od !== null ? String(order.altura_od) : '-';
  const alturaOI = order.altura_oi !== null ? String(order.altura_oi) : '-';
  const horizontal = order.montura_horizontal || '-';
  const vertical   = order.montura_vertical   || '-';
  const puente     = order.montura_puente     || '-';
  const diametro   = order.montura_diametro_max || '-';

  // ✅ NUEVO: Ojos afectados de la garantía ('OD' | 'OI' | 'BOTH' | null)
  // Si es null (garantías antiguas o Error de Medida) => muestra ambos ojos como siempre.
  const affected = order.affectedEyes || null;
  const showOD = !affected || affected === 'BOTH' || affected === 'OD';
  const showOI = !affected || affected === 'BOTH' || affected === 'OI';

  const sep = '---------------------------------------';
  const tableSep = '  +------+------+---+------+----+';
  const allLines = [];
  allLines.push('OPTI-COLOR #2, C.A.');
  allLines.push('** G A R A N T I A **');
  // OTG con número completo y nombre de sucursal
  const ordText = `OTG: ${codigoCompleto} | Suc: ${sucursal}`;
  const ordLines = wrapText(ordText, LINE_WIDTH);
  ordLines.forEach(l => allLines.push(l));
  if (order.warrantyType) {
    const tipoLines = wrapText(`Tipo: ${order.warrantyType}`, LINE_WIDTH);
    tipoLines.forEach(l => allLines.push(l));
  }
  // ✅ NUEVO: avisa qué ojo está afectado (solo cuando es un único ojo)
  if (affected === 'OD' || affected === 'OI') {
    allLines.push(`Ojos afectados: ${affected === 'OD' ? 'OD (Ojo Derecho)' : 'OI (Ojo Izquierdo)'}`);
  }
  allLines.push(`Fecha Impresion: ${fechaImpresion}`);
  allLines.push('');
  allLines.push('    Esf    Cil   Eje  Add   DP');
  // ✅ NUEVO: tabla RX imprime SOLO el ojo afectado
  if (showOD) {
    allLines.push(tableSep);
    allLines.push(`OD|${odEsf}|${odCil}|${odEje}|${odAdd}|${odDp}|`);
  }
  if (showOI) {
    allLines.push(tableSep);
    allLines.push(`OI|${oiEsf}|${oiCil}|${oiEje}|${oiAdd}|${oiDp}|`);
  }
  allLines.push(tableSep);
  allLines.push('');
  allLines.push('Detalles de Vision :');
  const lensWrapWidth = 22;
  const lenteLines = wrapText(tipoLente, lensWrapWidth);
  const firstLente = lenteLines[0] || '';
  // ✅ NUEVO: alturas solo del ojo afectado
  if (showOD) allLines.push(`OD: ${padRight(firstLente, lensWrapWidth)} | Alt: ${alturaOD}`);
  if (showOI) allLines.push(`OI: ${padRight(firstLente, lensWrapWidth)} | Alt: ${alturaOI}`);
  for (let i = 1; i < lenteLines.length; i++) {
    allLines.push(`    ${lenteLines[i]}`);
  }
  allLines.push('');
  allLines.push('Medidas de Montura :');
  allLines.push(`H:${horizontal} V:${vertical} P:${puente} Max:${diametro}`);
  allLines.push('');
  allLines.push('            REQUERIMIENTOS');
  allLines.push(sep);
  safeItems.forEach(item => {
    const cantidad = parseFloat(item.cantidad).toFixed(2);
    const descLines = wrapText(item.descripcion || 'Sin descripción', 28);
    const firstLineDesc = descLines[0] || '';
    const firstLineQty = padLeft(cantidad, 5);
    allLines.push(`${padRight(firstLineDesc, 28)} ${firstLineQty}`);
    for (let i = 1; i < descLines.length; i++) {
      allLines.push(padRight(descLines[i], 28));
    }
  });
  return allLines.join('\n');
}

// ============================================================
// GENERACIÓN DE BUFFER ESC/POS
// ============================================================
async function generateEscPosBuffer(order, items) {
  const safeItems = Array.isArray(items) ? items : [];
  return new Promise((resolve, reject) => {
    let dataBuffer = Buffer.alloc(0);
    const device = {
      write: (data, cb) => {
        dataBuffer = Buffer.concat([dataBuffer, data]);
        if (cb) cb(null);
      },
      close: (cb) => { if (cb) cb(null); }
    };
    const printer = new escpos.Printer(device);
    try {
      const ticketText = generateTicketText(order, safeItems);
      if (!ticketText || ticketText.trim().length === 0) {
        throw new Error('El ticket generado está vacío');
      }
      printer.size(0, 0);
      printer.font('A');
      const lines = ticketText.split('\n');
      lines.forEach((line, idx) => {
        const isGarantiaLine = line.includes('** G A R A N T I A **');
        if (isGarantiaLine) {
          printer.size(1, 1);
          printer.style('B');
          printer.align('CT');
          printer.text(line);
          printer.size(0, 0);
          printer.style('NORMAL');
        } else {
          if (idx === 0) printer.align('CT');
          else printer.align('LT');
          if (line.trim() === '') printer.text('');
          else printer.text(line);
        }
      });
      // Código de barras con número completo
      const barcodeValue = order.codigo_completo || order.orden_numero || '';
      if (barcodeValue) {
        printer.feed(2);
        printer.align('CT');
        printer.barcode(String(barcodeValue), 'CODE39', {
          width: 1, height: 50, position: 'OFF'
        });
        const formattedCode = '* ' + String(barcodeValue).split('').join(' ') + ' *';
        printer.text(formattedCode);
        logger.info(`Código de barras generado en CODE39 para OT: ${barcodeValue}`);
      }
      printer.feed(3);
      printer.text('--------------------------------');
      printer.feed(2);
      printer.cut(true);
      printer.close(() => resolve(Buffer.from(dataBuffer)));
    } catch (err) {
      logger.error(`Error generando buffer ESC/POS: ${err.message}`);
      reject(err);
    }
  });
}

// ============================================================
// EXPORTACIONES
// ============================================================
module.exports = {
  generateTicketText,
  generateEscPosBuffer,
};