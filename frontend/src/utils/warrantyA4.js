// frontend/src/utils/warrantyA4.js
// Generador puro del HTML A4 de la Orden de Garantía.
// Sin window/document: puede importarse desde Node para pruebas.

const CODE39_PATTERNS = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101011', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
  'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
  'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110011010101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
  '$': '100100100101', '/': '100100101001', '+': '100101001001', '%': '101001001001',
};

export const generateCode39Svg = (value, { moduleWidth = 2, height = 60 } = {}) => {
  const text = `*${String(value).toUpperCase()}*`;
  let x = 0;
  let rects = '';
  for (const char of text) {
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) continue;
    for (const bit of pattern) {
      if (bit === '1') {
        rects += `<rect x="${x}" y="0" width="${moduleWidth}" height="${height}"></rect>`;
      }
      x += moduleWidth;
    }
    x += moduleWidth;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" ` +
    `viewBox="0 0 ${x} ${height}">${rects}</svg>`
  );
};

/**
 * Construye el HTML completo del A4.
 * @param {Object} options
 * @param {Object} options.data - Orden normalizada.
 * @param {string} options.type - Tipo de garantía.
 * @param {string} [options.observations]
 * @param {string} [options.storeName]
 * @param {string} [options.accn]
 * @param {string} [options.affectedLabel]
 * @param {string[]|null} [options.eyes] - null/undefined = ambos.
 * @param {string} [options.categoryLabel]
 * @returns {string}
 */
export function buildWarrantyA4Html({
  data,
  type,
  observations,
  storeName,
  accn,
  affectedLabel,
  eyes,
  categoryLabel,
}) {
  const order = data || {};
  const revision = order.revision ?? 1;

  const showOD = !eyes || eyes.includes('OD');
  const showOI = !eyes || eyes.includes('OI');

  let rxRows = '';
  if (showOD) {
    rxRows += `
<tr>
  <td>OD</td>
  <td>${order.od_esfera ?? '-'}</td>
  <td>${order.od_cilindro ?? '-'}</td>
  <td>${order.od_eje ?? '-'}</td>
  <td>${order.od_adicion ?? '-'}</td>
  <td>${order.od_dp_centro ?? order.od_dp_cerca ?? '-'}</td>
  <td>${order.altura_od ?? '-'}</td>
</tr>`;
  }
  if (showOI) {
    rxRows += `
<tr>
  <td>OI</td>
  <td>${order.oi_esfera ?? '-'}</td>
  <td>${order.oi_cilindro ?? '-'}</td>
  <td>${order.oi_eje ?? '-'}</td>
  <td>${order.oi_adicion ?? '-'}</td>
  <td>${order.oi_dp_centro ?? order.oi_dp_cerca ?? '-'}</td>
  <td>${order.altura_oi ?? '-'}</td>
</tr>`;
  }

  const barcodeValue = order.codigo_completo || order.orden_numero || '';
  const barcodeSvg = barcodeValue ? generateCode39Svg(barcodeValue) : '';

  const itemsHtml = (order.items || []).map(item => `
<tr>
  <td class="item-desc">${item.descripcion || '-'}</td>
  <td class="item-qty">${item.cantidad || 1}</td>
  <td class="item-code">${item.codigo_completo || '-'}</td>
</tr>
  `).join('');

  const montoFormateado = order.monto_total_usd !== null && order.monto_total_usd !== undefined
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(order.monto_total_usd)
    : null;
  const fechaFormateada = order.fecha_venta
    ? new Date(order.fecha_venta + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const notaConversion = order.moneda_original === 'VES'
    ? '<span style="font-size: 9px; color: #6b7280; font-style: italic;"> (convertido de Bs.)</span>'
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden de Garantía - ${order.codigo_completo || order.orden_numero} (Rev. ${revision})</title>
<style>
  @page { size: A4; margin: 0.6cm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #000; margin: 0; padding: 0;
    font-size: 13px; line-height: 1.3;
  }
  .sheet-box { border: 2px solid #000; page-break-inside: avoid; }
  /* ===== FILA 1: LOGO | CÓDIGO+OTG | DATOS ===== */
  .row1 { display: grid; grid-template-columns: 0.8fr 1.4fr 1.4fr; }
  .row1 .cell { border-right: 2px solid #000; padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; }
  .row1 .cell:last-child { border-right: none; }
  .logo { height: 68px; width: auto; object-fit: contain; display: block; margin: 0 auto; }
  .barcode-box svg { height: 46px; fill: #000; display: block; margin: 0 auto; }
  .otg { text-align: center; font-family: monospace; font-size: 17px; font-weight: bold; letter-spacing: 1px; margin-top: 4px; }
  .meta div { margin-bottom: 3px; }
  .meta .label { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .meta .value { font-size: 13px; font-weight: bold; }
  /* ===== FILA 2: RX | ÍTEMS ===== */
  .row2 { display: grid; grid-template-columns: 1.2fr 1fr; border-top: 2px solid #000; }
  .row2 .cell { border-right: 2px solid #000; padding: 8px 10px; }
  .row2 .cell:last-child { border-right: none; }
  .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  .rx th { border: 1px solid #000; padding: 4px; font-size: 11px; text-align: center; background: #eee; }
  .rx td { border: 1px solid #000; padding: 5px 4px; font-size: 13px; font-weight: bold; font-family: monospace; text-align: center; }
  .items th { border: 1px solid #000; padding: 4px 6px; font-size: 11px; text-align: center; background: #eee; }
  .items td { border: 1px solid #000; padding: 5px 6px; font-size: 12px; }
  .items .item-desc { text-align: left; }
  .items .item-qty { text-align: center; width: 12%; }
  .items .item-code { font-family: monospace; text-align: left; width: 32%; }
  /* ===== FILA 3: OBSERVACIONES | TIPO ===== */
  .bottom-row { width: 100%; table-layout: fixed; border-collapse: collapse; border-top: 2px solid #000; }
  .bottom-row td { border-right: 2px solid #000; padding: 8px 10px; vertical-align: top; }
  .bottom-row td:last-child { border-right: none; vertical-align: middle; }
  .obs { font-size: 13px; min-height: 36px; overflow-wrap: anywhere; word-wrap: break-word; white-space: normal; }
  .warranty-type { font-size: 16px; font-weight: bold; text-transform: uppercase; text-align: center; min-height: 36px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="sheet-box">
  <div class="row1">
    <div class="cell">
      <img src="/logo-opti.jpg" alt="Opti-Color" class="logo" />
    </div>
    <div class="cell">
      ${barcodeSvg ? `<div class="barcode-box">${barcodeSvg}</div>` : ''}
      <div class="otg">${order.codigo_completo || order.orden_numero}</div>
    </div>
    <div class="cell meta">
      <div><span class="label">Tienda:</span> <span class="value">${storeName || 'Tienda'} (${accn || '---'})</span></div>
      <div><span class="label">Revisión:</span> <span class="value">Rev. ${revision}</span></div>
      <div><span class="label">Asesor:</span> <span class="value">${order.asesor_nombre || '-'}</span></div>
      <div><span class="label">Cliente:</span> <span class="value">${order.cliente_nombre || 'Paciente'}</span></div>
      ${affectedLabel ? `<div><span class="label">Ojos afectados:</span> <span class="value">${affectedLabel}</span></div>` : ''}
      ${fechaFormateada ? `<div><span class="label">Fecha de Venta:</span> <span class="value">${fechaFormateada}</span></div>` : ''}
      ${montoFormateado !== null ? `<div><span class="label">Monto de Venta:</span> <span class="value" style="color: #059669;">$${montoFormateado}</span>${notaConversion}</div>` : ''}
      ${order.metodo_pago && order.metodo_pago !== 'No especificado' ? `<div><span class="label">Forma de Pago:</span> <span class="value">${order.metodo_pago}</span></div>` : ''}
    </div>
  </div>
  <div class="row2">
    <div class="cell">
      <div class="section-title">Prescripción Óptica (RX)</div>
      <table class="rx">
        <thead>
          <tr><th>Ojo</th><th>Esf.</th><th>Cil.</th><th>Eje</th><th>Add</th><th>DP</th><th>Alt.</th></tr>
        </thead>
        <tbody>
          ${rxRows}
        </tbody>
      </table>
      <div class="section-title" style="margin-top: 8px;">Medidas de la Montura</div>
      <table class="rx">
        <thead>
          <tr><th>Horizontal</th><th>Vertical</th><th>Puente</th><th>Diámetro Máx.</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${order.montura_horizontal ?? '-'}</td>
            <td>${order.montura_vertical ?? '-'}</td>
            <td>${order.montura_puente ?? '-'}</td>
            <td>${order.montura_diametro_max ?? '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="cell">
      <div class="section-title">Ítems de la Venta</div>
      <table class="items">
        <thead>
          <tr><th>Descripción</th><th class="item-qty">Cant.</th><th class="item-code">Código</th></tr>
        </thead>
        <tbody>
          ${itemsHtml || '<tr><td colspan="3" style="text-align:center;">Sin ítems registrados</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  <table class="bottom-row">
    <colgroup>
      <col style="width: 75%;" />
      <col style="width: 25%;" />
    </colgroup>
    <tbody>
      <tr>
        <td>
          <div class="section-title">Observaciones</div>
          <div class="obs">${observations || 'Sin observaciones adicionales.'}</div>
        </td>
        <td>
          <div class="section-title">Tipo de Garantía</div>
          <div class="warranty-type">${type}</div>
          ${categoryLabel ? `<div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #374151; margin-top: 4px;">Categoría: ${categoryLabel}</div>` : ''}
        </td>
      </tr>
    </tbody>
  </table>
</div>
<script>
  window.onload = function() {
    window.focus();
    window.print();
  }
</script>
</body>
</html>
  `;
}
