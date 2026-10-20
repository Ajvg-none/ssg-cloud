// frontend/src/pages/StoreWarranty.jsx
import React, { useState, useEffect } from 'react';
import { storeAPI, authAPI } from '../services/api';
import { validateOpticalFields, validateAffectedEyes } from '../utils/validators';
import useWarrantyFormStore from '../store/warrantyFormStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Select from '../components/ui/Select';
import StoreHeader from '../components/layout/StoreHeader';
import { Search, Save } from 'lucide-react';

// ✅ Fallback reduce el acoplamiento: catálogo real viene de GET /api/warranty-categories
// (fuente única backend); si la API falla, el formulario sigue usable con el catálogo hoy.
const FALLBACK_CATEGORIES = [
  {
    key: 'TIENDA',
    label: 'Tienda',
    warrantyTypes: [
      'Error de Medida',
      'Error de Transcripcion',
      'Error de RX',
      'Error de Tipo de Lente (Material)',
    ],
  },
  {
    key: 'LABORATORIO',
    label: 'Laboratorio',
    warrantyTypes: [
      'Error de Medida',
      'Error de Transcripcion',
      'Error de RX',
      'Error de Tipo de Lente (Material)',
    ],
  },
];

// ✅ NUEVO: tipo "Error de Tipo de Lente (Material)" (misma constante que el backend).
const LENS_MATERIAL_TYPE = 'Error de Tipo de Lente (Material)';
// Código de artículo: letra inicial + al menos 3 caracteres (ej: M121603, H000014).
const CODE_REGEX = /^[A-Z][A-Z0-9]{3,}$/;

// ============================================================
// 🖨️ GENERADOR DE CÓDIGO DE BARRAS CODE39 (SVG inline)
// Misma simbología CODE39 que usa el ticket de la impresora.
// Sin dependencias externas: funciona offline.
// ============================================================
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

const generateCode39Svg = (value, { moduleWidth = 2, height = 60 } = {}) => {
  const text = `*${String(value).toUpperCase()}*`; // * = inicio/fin CODE39
  let x = 0;
  let rects = '';
  for (const char of text) {
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) continue; // ignora caracteres no soportados por CODE39
    for (const bit of pattern) {
      if (bit === '1') {
        rects += `<rect x="${x}" y="0" width="${moduleWidth}" height="${height}"></rect>`;
      }
      x += moduleWidth;
    }
    x += moduleWidth; // separación entre caracteres (espacio estrecho)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" ` +
    `viewBox="0 0 ${x} ${height}">${rects}</svg>`
  );
};

const StoreWarranty = () => {
  // 🌐 Estado GLOBAL: sobrevive a la navegación entre pestañas
  const {
    orderNumber,
    orderData,
    warrantyCategory,    // ✅ NUEVO: TIENDA | LABORATORIO
    categories,          // ✅ NUEVO: catálogo desde GET /api/warranty-categories
    warrantyType,
    storeObservations,
    affectedEyes,        // ✅ NUEVO: ['OD'] / ['OI'] / ['OD','OI']
    // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
    warrantyCase,        // 'SAME_ORDER' | 'NEW_ORDER' | null
    newFrameCode,
    newLensCode,
    newOrderNumber,
    loading,
    saving,
    alert,
    errors,
    setOrderNumber,
    setWarrantyCategory,   // ✅ NUEVO
    setWarrantyType,
    setStoreObservations,
    setAffectedEyes,       // ✅ selección única de ojo (OD | OI | BOTH)
    setWarrantyCase,
    setNewFrameCode,
    setNewLensCode,
    setNewOrderNumber,
    setAlert,
    setErrors,
    handleFieldChange,
    searchOrder,
    setSaving,
    resetForm,
  } = useWarrantyFormStore();

  const [storeInfo, setStoreInfo] = useState({ name: '', accn: '' });

  // ✅ NUEVO: resolución de la descripción de los códigos nuevos en GesVision
  // (solo Caso 1 SAME_ORDER). No bloqueante: solo confirmación visual.
  const [frameLookup, setFrameLookup] = useState({ status: 'idle', description: null });
  const [lensLookup, setLensLookup] = useState({ status: 'idle', description: null });

  // Cargar datos de la tienda (para el encabezado de la Orden de Garantía)
  useEffect(() => {
    const loadStoreInfo = async () => {
      try {
        const res = await authAPI.me();
        const s = res.data?.user?.store;
        if (s) setStoreInfo({ name: s.name || '', accn: s.accn || '' });
      } catch {
        // Silencioso: se usará 'Tienda' como respaldo en el PDF
      }
    };
    loadStoreInfo();
  }, []);

  // ✅ NUEVO: catálogo de categorías (una llamada; el store guarda el resultado)
  useEffect(() => {
    useWarrantyFormStore.getState().loadCategories();
  }, []);

  // ✅ NUEVO: catálogo vigente y lista de tipos según la categoría elegida
  const activeCategories = (categories.length ? categories : FALLBACK_CATEGORIES);
  const activeCategory = activeCategories.find((c) => c.key === warrantyCategory) || activeCategories[0];
  const warrantyTypeOptions = (activeCategory?.warrantyTypes || []).map((type) => ({ value: type, label: type }));

  // ✅ NUEVO: ¿El tipo actual es Error de RX / Transcripción?
  const isRXType = warrantyType === 'Error de Transcripcion' || warrantyType === 'Error de RX';

  // ✅ NUEVO: flags del tipo "Error de Tipo de Lente (Material)"
  const isLensMaterial = warrantyType === LENS_MATERIAL_TYPE;
  const isNewOrderCase = isLensMaterial && warrantyCase === 'NEW_ORDER';
  const isSameOrderCase = isLensMaterial && warrantyCase === 'SAME_ORDER';

  // ✅ NUEVO: lookup con debounce (450ms) contra GesVision de los códigos
  // nuevos mientras el asesor tipea. Solo en Caso 1 (SAME_ORDER).
  useEffect(() => {
    if (!isSameOrderCase) {
      setFrameLookup({ status: 'idle', description: null });
      return undefined;
    }
    const clean = (newFrameCode || '').trim();
    if (!clean) {
      setFrameLookup({ status: 'idle', description: null });
      return undefined;
    }
    setFrameLookup((prev) => (prev.status === 'found' ? prev : { status: 'loading', description: null }));
    const timer = setTimeout(async () => {
      try {
        const res = await storeAPI.getProduct(clean);
        setFrameLookup({ status: 'found', description: res.data.product?.description || 'Producto sin descripción' });
      } catch (e) {
        if (e.response?.status === 404) {
          setFrameLookup({ status: 'missing', description: null });
        } else {
          setFrameLookup({ status: 'error', description: null });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [newFrameCode, isSameOrderCase]);

  useEffect(() => {
    if (!isSameOrderCase) {
      setLensLookup({ status: 'idle', description: null });
      return undefined;
    }
    const clean = (newLensCode || '').trim();
    if (!clean) {
      setLensLookup({ status: 'idle', description: null });
      return undefined;
    }
    setLensLookup((prev) => (prev.status === 'found' ? prev : { status: 'loading', description: null }));
    const timer = setTimeout(async () => {
      try {
        const res = await storeAPI.getProduct(clean);
        setLensLookup({ status: 'found', description: res.data.product?.description || 'Producto sin descripción' });
      } catch (e) {
        if (e.response?.status === 404) {
          setLensLookup({ status: 'missing', description: null });
        } else {
          setLensLookup({ status: 'error', description: null });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [newLensCode, isSameOrderCase]);

  // ✅ Visibilidad de las cards RX: RX → según selección; Medida → ambas visibles; sin tipo → ocultas
  const odOpen = isRXType ? affectedEyes.includes('OD') : !!warrantyType;
  const oiOpen = isRXType ? affectedEyes.includes('OI') : !!warrantyType;

  // ✅ NUEVO: etiqueta legible de ojos afectados (para el sello del A4)
  const affectedEyesLabel = isRXType
    ? (affectedEyes.length === 2
      ? 'Ambos ojos'
      : affectedEyes.includes('OD')
        ? 'Ojo Derecho (OD)'
        : affectedEyes.includes('OI')
          ? 'Ojo Izquierdo (OI)'
          : '')
    : '';

  // ============================================================
  // FUNCIÓN PARA GENERAR E IMPRIMIR LA ORDEN DE GARANTÍA (PDF A4)
  // ✅ NUEVO: recibe affectedLabel (sello) y eyes (filas a mostrar)
  // ✅ NUEVO: incluye Fecha de Venta, Monto de Venta y Forma de Pago
  // ✅ NUEVO: recibe categoryLabel (categoría bajo el tipo de garantía)
  // ============================================================
  const generateAndPrintWarrantyOrder = (data, type, observations, storeName, accn, affectedLabel, eyes, categoryLabel) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setAlert({ type: 'warning', message: 'Por favor, permite las ventanas emergentes para imprimir la orden.' });
      return;
    }

    const revision = data.revision ?? 1;

    // ✅ NUEVO: qué ojos mostrar en la tabla RX (null/undefined = ambos)
    const showOD = !eyes || eyes.includes('OD');
    const showOI = !eyes || eyes.includes('OI');

    let rxRows = '';
    if (showOD) {
      rxRows += `
<tr>
  <td>OD</td>
  <td>${data.od_esfera ?? '-'}</td>
  <td>${data.od_cilindro ?? '-'}</td>
  <td>${data.od_eje ?? '-'}</td>
  <td>${data.od_adicion ?? '-'}</td>
  <td>${data.od_dp_centro ?? data.od_dp_cerca ?? '-'}</td>
  <td>${data.altura_od ?? '-'}</td>
</tr>`;
    }
    if (showOI) {
      rxRows += `
<tr>
  <td>OI</td>
  <td>${data.oi_esfera ?? '-'}</td>
  <td>${data.oi_cilindro ?? '-'}</td>
  <td>${data.oi_eje ?? '-'}</td>
  <td>${data.oi_adicion ?? '-'}</td>
  <td>${data.oi_dp_centro ?? data.oi_dp_cerca ?? '-'}</td>
  <td>${data.altura_oi ?? '-'}</td>
</tr>`;
    }

    // 🖨️ código de barras del número de orden (CODE39, mismo valor que el ticket)
    const barcodeValue = data.codigo_completo || data.orden_numero || '';
    const barcodeSvg = barcodeValue ? generateCode39Svg(barcodeValue) : '';

    const itemsHtml = (data.items || []).map(item => `
<tr>
  <td class="item-desc">${item.descripcion || '-'}</td>
  <td class="item-qty">${item.cantidad || 1}</td>
  <td class="item-code">${item.codigo_completo || '-'}</td>
</tr>
    `).join('');

    // ✅ NUEVO: Formatear monto y fecha para el PDF
    const montoFormateado = data.monto_total_usd !== null && data.monto_total_usd !== undefined
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data.monto_total_usd)
      : null;
    const fechaFormateada = data.fecha_venta
      ? new Date(data.fecha_venta + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;
    const notaConversion = data.moneda_original === 'VES'
      ? '<span style="font-size: 9px; color: #6b7280; font-style: italic;"> (convertido de Bs.)</span>'
      : '';

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden de Garantía - ${data.codigo_completo || data.orden_numero} (Rev. ${revision})</title>
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
      <div class="otg">${data.codigo_completo || data.orden_numero}</div>
    </div>
    <div class="cell meta">
      <div><span class="label">Tienda:</span> <span class="value">${storeName || 'Tienda'} (${accn || '---'})</span></div>
      <div><span class="label">Revisión:</span> <span class="value">Rev. ${revision}</span></div>
      <div><span class="label">Asesor:</span> <span class="value">${data.asesor_nombre || '-'}</span></div>
      <div><span class="label">Cliente:</span> <span class="value">${data.cliente_nombre || 'Paciente'}</span></div>
      ${affectedLabel ? `<div><span class="label">Ojos afectados:</span> <span class="value">${affectedLabel}</span></div>` : ''}
      ${fechaFormateada ? `<div><span class="label">Fecha de Venta:</span> <span class="value">${fechaFormateada}</span></div>` : ''}
      ${montoFormateado !== null ? `<div><span class="label">Monto de Venta:</span> <span class="value" style="color: #059669;">$${montoFormateado}</span>${notaConversion}</div>` : ''}
      ${data.metodo_pago && data.metodo_pago !== 'No especificado' ? `<div><span class="label">Forma de Pago:</span> <span class="value">${data.metodo_pago}</span></div>` : ''}
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
            <td>${data.montura_horizontal ?? '-'}</td>
            <td>${data.montura_vertical ?? '-'}</td>
            <td>${data.montura_puente ?? '-'}</td>
            <td>${data.montura_diametro_max ?? '-'}</td>
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

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // ============================================================
  // CONTROL DE CAMPOS BLOQUEADOS SEGÚN TIPO DE GARANTÍA
  // ✅ NUEVO: en RX/Transcripción respeta los ojos seleccionados
  // ============================================================
  const isFieldDisabled = (fieldName) => {
    if (!warrantyType) return true;

    // ✅ NUEVO: en "Error de Tipo de Lente (Material)" TODOS los campos son de
    // solo lectura (la única edición son los 2 inputs de códigos nuevos del
    // bloque del caso). Los datos leídos son referencia.
    if (isLensMaterial) return true;

    if (warrantyType === 'Error de Medida') {
      const allowedFields = [
        'od_dp_centro', 'od_dp_cerca', 'oi_dp_centro', 'oi_dp_cerca',
        'altura_od', 'altura_oi',
        'montura_horizontal', 'montura_vertical', 'montura_puente', 'montura_diametro_max'
      ];
      return !allowedFields.includes(fieldName);
    }

    if (isRXType) {
      const isODField = fieldName.startsWith('od_') || fieldName === 'altura_od';
      const isOIField = fieldName.startsWith('oi_') || fieldName === 'altura_oi';
      if (isODField) return !affectedEyes.includes('OD');
      if (isOIField) return !affectedEyes.includes('OI');
      return false; // montura sigue editable
    }

    return true;
  };

  const handleSearch = () => {
    // ✅ NUEVO: en el Caso 2 (nueva OT pagada) se busca la NUEVA OT que el
    // usuario tipeó en el bloque del caso, no la del input superior.
    if (isNewOrderCase) {
      if (!newOrderNumber.trim()) {
        setAlert({ type: 'warning', message: 'Primero indica la nueva OT generada en GesVision.' });
        return;
      }
      searchOrder(newOrderNumber.trim());
      return;
    }
    searchOrder();
  };

  // ============================================================
  // GUARDAR GARANTÍA + FORMATO A4 (el ticket tickera lo imprime el lab)
  // ✅ NUEVO: ramas del tipo "Error de Tipo de Lente (Material)"
  // ============================================================

  // ✅ NUEVO: replica en cliente el reemplazo de códigos del Caso 1 (SAME_ORDER)
  // para que el A4 muestre los códigos nuevos igual que el VCA del laboratorio.
  // Para los otros tipos no cambia nada (no se pasan códigos).
  const applyLocalArticleCodes = (data, frameCode, lensCode) => {
    const frame = String(frameCode || '').trim().toUpperCase();
    const lens = String(lensCode || '').trim().toUpperCase();
    const items = (data.items || []).map((item) => {
      if (item.es_montura && frame) {
        return { ...item, codigo_articulo: frame, codigo_completo: frame, prefijo: frame.charAt(0) };
      }
      if (item.es_cristal && lens) {
        return { ...item, codigo_articulo: lens, codigo_completo: lens, prefijo: lens.charAt(0) };
      }
      return item;
    });
    return { ...data, items };
  };

  const handleSave = async () => {
    const validationErrors = {
      ...validateOpticalFields(orderData),
      ...validateAffectedEyes(warrantyType, affectedEyes),
    };

    if (!warrantyType) validationErrors.warrantyType = 'Selecciona un tipo de garantía';

    // ✅ NUEVO: validación del caso y los códigos nuevos
    if (isLensMaterial) {
      if (!warrantyCase) {
        validationErrors.warrantyCase = 'Debe indicar si el cliente paga diferencia';
      } else if (warrantyCase === 'SAME_ORDER') {
        if (!CODE_REGEX.test((newFrameCode || '').trim())) {
          validationErrors.newFrameCode = 'Código inválido (letra inicial + al menos 3 caracteres)';
        }
        if (!CODE_REGEX.test((newLensCode || '').trim())) {
          validationErrors.newLensCode = 'Código inválido (letra inicial + al menos 3 caracteres)';
        }
      } else if (warrantyCase === 'NEW_ORDER' && !newOrderNumber.trim()) {
        validationErrors.newOrderNumber = 'Indica la nueva OT generada en GesVision';
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setAlert({ type: 'error', message: 'Por favor corrige los errores antes de guardar' });
      return;
    }

    setSaving(true);
    setAlert(null);

    try {
      // ✅ NUEVO: valor normalizado para el backend ('OD' | 'OI' | 'BOTH' | null)
      const affectedEyesValue = isRXType
        ? (affectedEyes.length === 2 ? 'BOTH' : affectedEyes[0])
        : null;

      const response = await storeAPI.createWarranty({
        orderNumber: orderData.orden_numero,
        orderData: orderData,
        // ✅ NUEVO: categoría de garantía (dónde originó el defecto)
        category: warrantyCategory,
        warrantyType,
        storeObservations: storeObservations.trim() || null,
        affectedEyes: affectedEyesValue,
        // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
        warrantyCase: isLensMaterial ? warrantyCase : null,
        newFrameCode: isLensMaterial && warrantyCase === 'SAME_ORDER'
          ? newFrameCode.trim().toUpperCase()
          : null,
        newLensCode: isLensMaterial && warrantyCase === 'SAME_ORDER'
          ? newLensCode.trim().toUpperCase()
          : null,
        newOrderNumber: isLensMaterial && warrantyCase === 'NEW_ORDER'
          ? newOrderNumber.trim()
          : null,
      });

      const created = response.data.warranty;

      // 1) Orden de garantía en PDF A4 (con sello y solo el ojo afectado).
      // ✅ NUEVO: se omite por completo en el Caso 2 (nueva OT pagada, no lleva orden).
      if (created.requiresVca) {
        const printData = {
          // ✅ NUEVO: en Caso 1 los ítems llevarán los códigos nuevos (VCA/A4 iguales)
          ...applyLocalArticleCodes(orderData, newFrameCode, newLensCode),
          orden_numero: created.orderNumber,
          codigo_completo: created.orderNumber,
          revision: created.revision,
        };

        generateAndPrintWarrantyOrder(
          printData,
          warrantyType,
          storeObservations,
          storeInfo.name,
          storeInfo.accn,
          affectedEyesLabel,
          isRXType ? affectedEyes : null,
          // ✅ NUEVO: etiqueta de la categoría para el A4
          activeCategory?.label || warrantyCategory
        );
      }

      const message = created.requiresVca
        ? `Garantía guardada (Rev. ${created.revision}). El laboratorio imprimirá el ticket y la procesará.`
        : `Garantía registrada como nueva orden pagada (${created.newOrderNumber}). No requiere VCA ni ticket.`;

      setAlert({ type: 'success', message });

      setTimeout(() => {
        resetForm();
      }, 4000);

    } catch (error) {
      setAlert({
        type: 'error',
        message:
          error.response?.data?.details?.join(', ') ||
          error.response?.data?.error ||
          'Error al guardar la garantía',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-opticolor-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto animate-slide-up">
        <StoreHeader />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-opticolor-gray-900 mb-2">Nueva Garantía</h1>
          <p className="text-opticolor-gray-600">Busca una OTG de GesVision y completa los datos de la garantía</p>
        </div>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        {/* ============================================================
            BUSCAR OTG
        ============================================================ */}
        <Card
          className="mb-6"
          title="Buscar OTG"
          subtitle="Ingresa el número de orden de GesVision para cargar los datos"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex-1">
              <Input
                label="Número de OTG"
                placeholder="Ej: 12345"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                disabled={loading || saving}
                className="py-2.5"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                loading={loading}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Buscar
              </Button>
            </div>
          </div>
        </Card>

        {orderData && (
          <div className="space-y-6 animate-fade-in">
            {/* ============================================================
                DATOS DEL CLIENTE (SOLO LECTURA)
            ============================================================ */}
            <Card title="Datos del Cliente">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Nombre del Cliente"
                  value={orderData.cliente_nombre || ''}
                  readOnly
                />
                <Input
                  label="Código Completo"
                  value={orderData.codigo_completo || ''}
                  readOnly
                />
                <Input
                  label="Asesor / Responsable"
                  value={orderData.asesor_nombre || ''}
                  placeholder="Sin datos del asesor"
                  readOnly
                />
              </div>
            </Card>

            {/* ============================================================
                DATOS DE LA GARANTÍA
            ============================================================ */}
            <Card title="Datos de la Garantía">
              <div className="space-y-4">
                {/* ✅ NUEVO: categoría (dónde originó el defecto). Catálogo del
                    backend: aparecerán solas las categorías nuevas. */}
                <Select
                  label="Categoría de la Garantía *"
                  value={warrantyCategory}
                  onChange={(e) => setWarrantyCategory(e.target.value)}
                  disabled={saving}
                  placeholder="Seleccionar categoría..."
                  options={activeCategories.map((c) => ({ value: c.key, label: c.label }))}
                />

                <Select
                  label="Tipo de Garantía *"
                  value={warrantyType}
                  onChange={(e) => setWarrantyType(e.target.value)}
                  disabled={saving}
                  error={errors.warrantyType}
                  placeholder="Seleccionar tipo..."
                  options={warrantyTypeOptions}
                />

                {/* ✅ NUEVO: caso del tipo "Error de Tipo de Lente (Material)" */}
                {isLensMaterial && (
                  <div className="space-y-4 rounded-lg border border-opticolor-gray-200 bg-opticolor-gray-50 p-4">
                    <div>
                      <p className="block text-sm font-medium text-opticolor-gray-700 mb-2">
                        ¿El cliente paga diferencia? *
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={warrantyCase === 'SAME_ORDER' ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setWarrantyCase('SAME_ORDER')}
                          disabled={saving}
                        >
                          NO paga (misma OT)
                        </Button>
                        <Button
                          type="button"
                          variant={warrantyCase === 'NEW_ORDER' ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setWarrantyCase('NEW_ORDER')}
                          disabled={saving}
                        >
                          SÍ paga (nueva OT)
                        </Button>
                      </div>
                      {errors.warrantyCase && (
                        <p className="text-sm text-opticolor-red-light animate-fade-in mt-2">
                          {errors.warrantyCase}
                        </p>
                      )}
                    </div>

                    {warrantyCase === 'SAME_ORDER' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Input
                            label="Nuevo código de montura *"
                            placeholder="Ej: M121603"
                            value={newFrameCode}
                            onChange={(e) => setNewFrameCode(e.target.value.toUpperCase())}
                            error={errors.newFrameCode}
                            disabled={saving}
                          />
                          {frameLookup.status === 'loading' && (
                            <p className="text-xs text-opticolor-gray-400 mt-1">
                              Buscando el artículo en GesVision...
                            </p>
                          )}
                          {frameLookup.status === 'found' && (
                            <p className="text-xs font-medium text-green-600 mt-1 truncate" title={frameLookup.description}>
                              ✓ {frameLookup.description}
                            </p>
                          )}
                          {frameLookup.status === 'missing' && (
                            <p className="text-xs text-yellow-600 mt-1">
                              ⚠ Código no encontrado en GesVision; verifica el número antes de guardar.
                            </p>
                          )}
                          {frameLookup.status === 'error' && (
                            <p className="text-xs text-opticolor-gray-400 mt-1">
                              No se pudo consultar GesVision (la garantía puede guardarse igual).
                            </p>
                          )}
                        </div>
                        <div>
                          <Input
                            label="Nuevo código de cristal *"
                            placeholder="Ej: H000014"
                            value={newLensCode}
                            onChange={(e) => setNewLensCode(e.target.value.toUpperCase())}
                            error={errors.newLensCode}
                            disabled={saving}
                          />
                          {lensLookup.status === 'loading' && (
                            <p className="text-xs text-opticolor-gray-400 mt-1">
                              Buscando el artículo en GesVision...
                            </p>
                          )}
                          {lensLookup.status === 'found' && (
                            <p className="text-xs font-medium text-green-600 mt-1 truncate" title={lensLookup.description}>
                              ✓ {lensLookup.description}
                            </p>
                          )}
                          {lensLookup.status === 'missing' && (
                            <p className="text-xs text-yellow-600 mt-1">
                              ⚠ Código no encontrado en GesVision; verifica el número antes de guardar.
                            </p>
                          )}
                          {lensLookup.status === 'error' && (
                            <p className="text-xs text-opticolor-gray-400 mt-1">
                              No se pudo consultar GesVision (la garantía puede guardarse igual).
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {warrantyCase === 'NEW_ORDER' && (
                      <div className="space-y-2">
                        <Input
                          label="Nueva OT generada en GesVision *"
                          placeholder="Ej: 114200001933"
                          value={newOrderNumber}
                          onChange={(e) => setNewOrderNumber(e.target.value.trim())}
                          error={errors.newOrderNumber}
                          disabled={saving}
                        />
                        <p className="text-xs text-opticolor-gray-500">
                          Se registrará como nueva orden pagada. No genera VCA ni ticket.
                          Presioná «Buscar» para cargar los datos informativos desde GesVision.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ✅ NUEVO: selector único de ojos (solo RX/Transcripción), centrado */}
                <div className={`reveal ${isRXType ? 'open' : ''}`}>
                  <div className="reveal-inner">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        onClick={() => setAffectedEyes('OD')}
                        disabled={saving}
                        variant={affectedEyes.includes('OD') ? 'primary' : 'secondary'}
                        size="sm"
                      >
                        Ojo Derecho (OD)
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setAffectedEyes('OI')}
                        disabled={saving}
                        variant={affectedEyes.includes('OI') ? 'primary' : 'secondary'}
                        size="sm"
                      >
                        Ojo Izquierdo (OI)
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setAffectedEyes('BOTH')}
                        disabled={saving}
                        variant={affectedEyes.length === 2 ? 'primary' : 'secondary'}
                        size="sm"
                      >
                        Ambos ojos
                      </Button>
                    </div>

                    {isRXType && affectedEyes.length === 0 && (
                      <p className="text-center text-xs text-opticolor-gray-400 mt-2">
                        Selecciona el ojo u ojos afectados para editar su receta
                      </p>
                    )}

                    {errors.affectedEyes && (
                      <p className="text-center text-sm text-opticolor-red-light animate-fade-in mt-1">
                        {errors.affectedEyes}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">
                    Observaciones
                  </label>
                  <textarea
                    value={storeObservations}
                    onChange={(e) => setStoreObservations(e.target.value)}
                    maxLength={300}
                    rows={3}
                    disabled={saving}
                    placeholder="Describe brevemente el caso (máx. 300 caracteres)"
                    className="w-full px-4 py-2.5 border-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-opticolor-red focus:border-transparent border-opticolor-gray-200 hover:border-opticolor-gray-300 disabled:bg-opticolor-gray-50 disabled:cursor-not-allowed resize-none"
                  />
                  <p className="text-xs text-opticolor-gray-400 mt-1 text-right">
                    {storeObservations.length}/300
                  </p>
                </div>
              </div>
            </Card>

            {/* ============================================================
                OJO DERECHO (OD)
            ============================================================ */}
            <div className={`collapse ${odOpen ? 'open' : ''}`}>
              <div className="collapse-inner">
                <Card title="Ojo Derecho (OD)">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Esfera"
                      type="number"
                      step="0.01"
                      value={orderData.od_esfera ?? ''}
                      onChange={(e) => handleFieldChange('od_esfera', e.target.value)}
                      error={errors.od_esfera}
                      disabled={isFieldDisabled('od_esfera') || saving}
                    />
                    <Input
                      label="Cilindro"
                      type="number"
                      step="0.01"
                      value={orderData.od_cilindro ?? ''}
                      onChange={(e) => handleFieldChange('od_cilindro', e.target.value)}
                      error={errors.od_cilindro}
                      disabled={isFieldDisabled('od_cilindro') || saving}
                    />
                    <Input
                      label="Eje"
                      type="number"
                      min="0"
                      max="180"
                      value={orderData.od_eje ?? ''}
                      onChange={(e) => handleFieldChange('od_eje', e.target.value)}
                      error={errors.od_eje}
                      disabled={isFieldDisabled('od_eje') || saving}
                    />
                    <Input
                      label="Adición"
                      type="number"
                      step="0.01"
                      value={orderData.od_adicion ?? ''}
                      onChange={(e) => handleFieldChange('od_adicion', e.target.value)}
                      error={errors.od_adicion}
                      disabled={isFieldDisabled('od_adicion') || saving}
                    />
                    <Input
                      label="DP Centro"
                      type="number"
                      step="0.1"
                      value={orderData.od_dp_centro ?? ''}
                      onChange={(e) => handleFieldChange('od_dp_centro', e.target.value)}
                      error={errors.od_dp_centro}
                      disabled={isFieldDisabled('od_dp_centro') || saving}
                    />
                    <Input
                      label="DP Cerca"
                      type="number"
                      step="0.1"
                      value={orderData.od_dp_cerca ?? ''}
                      onChange={(e) => handleFieldChange('od_dp_cerca', e.target.value)}
                      error={errors.od_dp_cerca}
                      disabled={isFieldDisabled('od_dp_cerca') || saving}
                    />
                    <Input
                      label="Altura"
                      type="number"
                      step="0.1"
                      value={orderData.altura_od ?? ''}
                      onChange={(e) => handleFieldChange('altura_od', e.target.value)}
                      error={errors.altura_od}
                      disabled={isFieldDisabled('altura_od') || saving}
                    />
                  </div>
                </Card>
              </div>
            </div>

            {/* ============================================================
                OJO IZQUIERDO (OI)
            ============================================================ */}
            <div className={`collapse ${oiOpen ? 'open' : ''}`}>
              <div className="collapse-inner">
                <Card title="Ojo Izquierdo (OI)">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Esfera"
                      type="number"
                      step="0.01"
                      value={orderData.oi_esfera ?? ''}
                      onChange={(e) => handleFieldChange('oi_esfera', e.target.value)}
                      error={errors.oi_esfera}
                      disabled={isFieldDisabled('oi_esfera') || saving}
                    />
                    <Input
                      label="Cilindro"
                      type="number"
                      step="0.01"
                      value={orderData.oi_cilindro ?? ''}
                      onChange={(e) => handleFieldChange('oi_cilindro', e.target.value)}
                      error={errors.oi_cilindro}
                      disabled={isFieldDisabled('oi_cilindro') || saving}
                    />
                    <Input
                      label="Eje"
                      type="number"
                      min="0"
                      max="180"
                      value={orderData.oi_eje ?? ''}
                      onChange={(e) => handleFieldChange('oi_eje', e.target.value)}
                      error={errors.oi_eje}
                      disabled={isFieldDisabled('oi_eje') || saving}
                    />
                    <Input
                      label="Adición"
                      type="number"
                      step="0.01"
                      value={orderData.oi_adicion ?? ''}
                      onChange={(e) => handleFieldChange('oi_adicion', e.target.value)}
                      error={errors.oi_adicion}
                      disabled={isFieldDisabled('oi_adicion') || saving}
                    />
                    <Input
                      label="DP Centro"
                      type="number"
                      step="0.1"
                      value={orderData.oi_dp_centro ?? ''}
                      onChange={(e) => handleFieldChange('oi_dp_centro', e.target.value)}
                      error={errors.oi_dp_centro}
                      disabled={isFieldDisabled('oi_dp_centro') || saving}
                    />
                    <Input
                      label="DP Cerca"
                      type="number"
                      step="0.1"
                      value={orderData.oi_dp_cerca ?? ''}
                      onChange={(e) => handleFieldChange('oi_dp_cerca', e.target.value)}
                      error={errors.oi_dp_cerca}
                      disabled={isFieldDisabled('oi_dp_cerca') || saving}
                    />
                    <Input
                      label="Altura"
                      type="number"
                      step="0.1"
                      value={orderData.altura_oi ?? ''}
                      onChange={(e) => handleFieldChange('altura_oi', e.target.value)}
                      error={errors.altura_oi}
                      disabled={isFieldDisabled('altura_oi') || saving}
                    />
                  </div>
                </Card>
              </div>
            </div>

            {/* ============================================================
                MEDIDAS DE MONTURA
            ============================================================ */}
            <Card title="Medidas de Montura">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Horizontal"
                  type="number"
                  step="0.1"
                  value={orderData.montura_horizontal ?? ''}
                  onChange={(e) => handleFieldChange('montura_horizontal', e.target.value)}
                  disabled={isFieldDisabled('montura_horizontal') || saving}
                />
                <Input
                  label="Vertical"
                  type="number"
                  step="0.1"
                  value={orderData.montura_vertical ?? ''}
                  onChange={(e) => handleFieldChange('montura_vertical', e.target.value)}
                  disabled={isFieldDisabled('montura_vertical') || saving}
                />
                <Input
                  label="Puente"
                  type="number"
                  step="0.1"
                  value={orderData.montura_puente ?? ''}
                  onChange={(e) => handleFieldChange('montura_puente', e.target.value)}
                  disabled={isFieldDisabled('montura_puente') || saving}
                />
                <Input
                  label="Diámetro Máximo"
                  type="number"
                  step="0.1"
                  value={orderData.montura_diametro_max ?? ''}
                  onChange={(e) => handleFieldChange('montura_diametro_max', e.target.value)}
                  disabled={isFieldDisabled('montura_diametro_max') || saving}
                />
              </div>
            </Card>

            {/* ============================================================
                BOTÓN GUARDAR
            ============================================================ */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={
                  !orderData ||
                  (isLensMaterial &&
                    (!warrantyCase ||
                      (warrantyCase === 'SAME_ORDER' && (!newFrameCode.trim() || !newLensCode.trim())) ||
                      (warrantyCase === 'NEW_ORDER' && !newOrderNumber.trim())))
                }
                className="min-w-[200px] sm:min-w-[220px]"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {isNewOrderCase ? 'Registrar Nueva Orden' : 'Guardar y Generar Orden'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreWarranty;