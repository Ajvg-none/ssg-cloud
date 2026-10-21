// frontend/src/pages/StoreWarranty.jsx
import React, { useState, useEffect } from 'react';
import { storeAPI, authAPI } from '../services/api';
import { validateOpticalFields, validateAffectedEyes } from '../utils/validators';
import useWarrantyFormStore, { clearEyeData } from '../store/warrantyFormStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Alert from '../components/ui/Alert';
import Select from '../components/ui/Select';
import StorePageShell from '../components/store/StorePageShell';
import WarrantyStepper from '../components/store/WarrantyStepper';
import OrderSearchBar from '../components/store/OrderSearchBar';
import FormSection from '../components/store/FormSection';
import OrderSummaryPanel from '../components/store/OrderSummaryPanel';
import RxEyeSection from '../components/store/RxEyeSection';
import CaseDecisionCards from '../components/store/CaseDecisionCards';
import StickyActionBar from '../components/store/StickyActionBar';
import { buildWarrantyA4Html } from '../utils/warrantyA4';
import { Save, Ruler } from 'lucide-react';

// ✅ Fallback reduce el acoplamiento: catálogo real viene de GET /api/warranty-categories
// (fuente única backend); si la API falla, el formulario sigue usable con el catálogo hoy.
// ✅ El contrato LABORATORIO ya es definitivo: 3 tipos habilitados, sin VCA ni
// ticket (la Orden A4 la imprime la tienda) y nace COMPLETED.
const LAB_WARRANTY_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];

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
    blockedWarrantyTypes: [],
    blockedReason: null,
  },
  {
    key: 'LABORATORIO',
    label: 'Laboratorio',
    warrantyTypes: LAB_WARRANTY_TYPES,
    blockedWarrantyTypes: [],
    blockedReason: null,
  },
];

// ✅ NUEVO: tipo "Error de Tipo de Lente (Material)" (misma constante que el backend).
const LENS_MATERIAL_TYPE = 'Error de Tipo de Lente (Material)';
// Código de artículo: letra inicial + al menos 3 caracteres (ej: M121603, H000014).
const CODE_REGEX = /^[A-Z][A-Z0-9]{3,}$/;

// ============================================================
// ✅ NUEVO: estado visual del lookup de códigos nuevos (debounce 450ms).
// Presentacional; los estados loading/found/missing/error los setea la página.
// ============================================================
const CodeLookupStatus = ({ lookup }) => {
  if (!lookup || lookup.status === 'idle') return null;

  if (lookup.status === 'loading') {
    return <p className="mt-1 text-xs text-opticolor-gray-400">Buscando el artículo en GesVision...</p>;
  }
  if (lookup.status === 'found') {
    return (
      <p className="mt-1 truncate text-xs font-medium text-green-600" title={lookup.description}>
        ✓ {lookup.description}
      </p>
    );
  }
  if (lookup.status === 'missing') {
    return (
      <p className="mt-1 text-xs text-yellow-600">
        ⚠ Código no encontrado en GesVision; verifica el número antes de guardar.
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-opticolor-gray-400">
      No se pudo consultar GesVision (la garantía puede guardarse igual).
    </p>
  );
};

// ============================================================
// 🖨️ El generador CODE39 y la plantilla A4 viven en utils/warrantyA4.js
// (función pura, reutilizable por scripts de prueba).
// ============================================================

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

  // ✅ TEMPORAL: tipos visibles en el selector pero sin lógica de negocio definida.
  const isBlockedType =
    !!warrantyType && (activeCategory?.blockedWarrantyTypes || []).includes(warrantyType);
  const blockedTypeReason = isBlockedType
    ? `El tipo de garantía "${warrantyType}" está temporalmente no disponible. ${
        activeCategory?.blockedReason || ''
      }`.trim()
    : null;

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

  // ✅ Visibilidad de las cards RX: ahora en tarjetas comparables siempre visibles;
  // el bloqueo real sigue siendo `isFieldDisabled` (misma regla que antes).

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

    const htmlContent = buildWarrantyA4Html({
      data,
      type,
      observations,
      storeName,
      accn,
      affectedLabel,
      eyes,
      categoryLabel,
    });

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
    // Bloqueo temporal: no se envía la petición ni se valida el resto del formulario.
    if (blockedTypeReason) {
      setErrors({ ...errors, warrantyType: blockedTypeReason });
      setAlert({ type: 'error', message: blockedTypeReason });
      return;
    }

    const validationErrors = {
      ...validateOpticalFields(orderData),
      ...validateAffectedEyes(warrantyType, affectedEyes),
    };

    if (!warrantyType) validationErrors.warrantyType = 'Selecciona un tipo de garantía';
    // ✅ NUEVO: con lista vacía de tipos (LABORATORIO por ahora) no se permite
    // crear: mensaje claro y guardía también en backend (doble protección).
    if (warrantyTypeOptions.length === 0) {
      validationErrors.warrantyType = `La categoría ${activeCategory?.label || warrantyCategory} aún no tiene tipos de garantía definidos`;
    }

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
      // ✅ Solo se envían/imprimen los campos de los ojos seleccionados.
      const orderDataForSubmit = isRXType
        ? clearEyeData(
            orderData,
            ['OD', 'OI'].filter((eye) => !affectedEyes.includes(eye))
          )
        : orderData;

      // ✅ NUEVO: valor normalizado para el backend ('OD' | 'OI' | 'BOTH' | null)
      const affectedEyesValue = isRXType
        ? (affectedEyes.length === 2 ? 'BOTH' : affectedEyes[0])
        : null;

      const response = await storeAPI.createWarranty({
        orderNumber: orderData.orden_numero,
        orderData: orderDataForSubmit,
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
      // ✅ NUEVO: se omite ÚNICAMENTE en el Caso 2 de nueva OT pagada — es la única
      // garantía que no lleva orden impresa. Los tipos de LABORATORIO TAMBIÉN
      // imprimen A4 (decisión directiva) aunque no generen VCA ni ticket.
      if (created.warrantyCase !== 'NEW_ORDER') {
        const printData = {
          // ✅ NUEVO: en Caso 1 los ítems llevarán los códigos nuevos (VCA/A4 iguales)
          ...applyLocalArticleCodes(orderDataForSubmit, newFrameCode, newLensCode),
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

      const message =
        created.category === 'LABORATORIO'
          ? `Garantía de laboratorio registrada (Rev. ${created.revision}). No requiere VCA ni ticket; la Orden A4 se acaba de imprimir.`
          : created.requiresVca
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

  // ============================================================
  // ✅ DERIVADOS DE PRESENTACIÓN (no alteran lógica de negocio)
  // ============================================================

  // ✅ NUEVO: paso actual del stepper (derivado del estado, solo visual)
  const currentStep = !orderData ? 1 : !warrantyType ? 2 : 3;

  // ✅ NUEVO: checklist del panel lateral
  const caseCriteriaDone =
    warrantyCase === 'SAME_ORDER'
      ? CODE_REGEX.test((newFrameCode || '').trim()) && CODE_REGEX.test((newLensCode || '').trim())
      : warrantyCase === 'NEW_ORDER'
        ? !!newOrderNumber.trim()
        : false;
  const checklist = [
    { label: 'Orden cargada', done: !!orderData },
    { label: 'Categoría definida', done: !!activeCategory },
    { label: 'Tipo de garantía', done: !!warrantyType },
    ...(isRXType ? [{ label: 'Ojo(s) afectado(s)', done: affectedEyes.length > 0 }] : []),
    ...(isLensMaterial ? [{ label: 'Decisión del cliente', done: caseCriteriaDone }] : []),
  ];

  // ✅ NUEVO: datos formateados para el panel de resumen (presentación)
  const summaryOrder = orderData
    ? {
        code: orderData.codigo_completo || orderData.orden_numero || '-',
        clientName: orderData.cliente_nombre || 'Paciente',
        advisor: orderData.asesor_nombre || null,
        saleDate: orderData.fecha_venta
          ? new Date(orderData.fecha_venta + 'T12:00:00').toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })
          : null,
        saleAmount:
          orderData.monto_total_usd !== null && orderData.monto_total_usd !== undefined
            ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                orderData.monto_total_usd
              )
            : null,
        saleCurrency: orderData.moneda_original === 'VES' ? ' (convertido de Bs.)' : null,
        paymentMethod:
          orderData.metodo_pago && orderData.metodo_pago !== 'No especificado' ? orderData.metodo_pago : null,
        itemsCount: (orderData.items || []).length,
      }
    : null;

  // ✅ NUEVO: resumen de la garantía en construcción
  const selections = [
    { label: 'Categoría', value: activeCategory?.label || warrantyCategory },
    { label: 'Tipo', value: warrantyType || null },
    ...(isRXType ? [{ label: 'Ojos', value: affectedEyesLabel || null }] : []),
    ...(isLensMaterial
      ? [
          {
            label: 'Caso',
            value:
              warrantyCase === 'SAME_ORDER'
                ? 'Misma OT (no paga)'
                : warrantyCase === 'NEW_ORDER'
                  ? 'Nueva OT pagada'
                  : null,
          },
        ]
      : []),
  ];

  // ✅ NUEVO: motivo legible cuando el CTA está deshabilitado
  const saveDisabledReason = !orderData
    ? 'Buscá una OTG para comenzar'
    : warrantyTypeOptions.length === 0
      ? 'La categoría no tiene tipos de garantía definidos'
      : !warrantyType
        ? 'Elegí el tipo de garantía'
        : isRXType && affectedEyes.length === 0
          ? 'Seleccioná al menos un ojo afectado'
          : blockedTypeReason
            ? blockedTypeReason
            : isLensMaterial && !warrantyCase
              ? 'Indicá si el cliente paga diferencia'
              : isSameOrderCase && (!newFrameCode.trim() || !newLensCode.trim())
                ? 'Completá los códigos nuevos'
                : isNewOrderCase && !newOrderNumber.trim()
                  ? 'Indicá la nueva OT'
                  : '';

  // ✅ NUEVO: CTA compartido (rail desktop + barra sticky móvil).
  // Misma condición de guardia que antes; cero cambios de lógica.
  const saveButton = (
    <Button
      onClick={handleSave}
      loading={saving}
      disabled={
        !orderData ||
        warrantyTypeOptions.length === 0 || // ✅ NUEVO: sin tipos → no se crea
        !!blockedTypeReason ||
        (isRXType && affectedEyes.length === 0) ||
        (isLensMaterial &&
          (!warrantyCase ||
            (warrantyCase === 'SAME_ORDER' && (!newFrameCode.trim() || !newLensCode.trim())) ||
            (warrantyCase === 'NEW_ORDER' && !newOrderNumber.trim())))
      }
      className="w-full"
    >
      <Save className="h-4 w-4" aria-hidden="true" />
      <span className="sm:hidden">{isNewOrderCase ? 'Registrar' : 'Guardar'}</span>
      <span className="hidden sm:inline">
        {isNewOrderCase ? 'Registrar Nueva Orden' : 'Guardar y Generar Orden'}
      </span>
    </Button>
  );

  return (
    <StorePageShell className="pb-32 lg:pb-12">
      {/* Encabezado de página */}
      <div className="mb-6 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-opticolor-gray-900">Nueva garantía</h1>
        <p className="mt-1 text-sm text-opticolor-gray-500">
          Buscá una OTG de GesVision, clasificá el caso y generá la orden de garantía.
        </p>
      </div>

      {/* Stepper (derivado; solo presentación) */}
      <div className="mb-6 animate-slide-up rounded-2xl border border-opticolor-gray-200 bg-white p-5 shadow-soft sm:p-6">
        <WarrantyStepper current={currentStep} />
      </div>

      {/* Alertas */}
      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Grilla principal: contenido + panel lateral */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Columna principal */}
        <div className="min-w-0 animate-fade-in">
          {/* ============================================================
              PASO 1: BUSCAR OTG
          ============================================================ */}
          <FormSection
            step={1}
            title="Buscar OTG"
            description="Ingresa el número de orden de GesVision para cargar automáticamente los datos."
          >
            <OrderSearchBar
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onSearch={handleSearch}
              loading={loading}
              disabled={saving}
              compact={!!orderData}
            />
          </FormSection>

          {orderData && (
            <div className="mt-6 space-y-6">
              {/* ============================================================
                  PASO 2: CLASIFICAR LA GARANTÍA
              ============================================================ */}
              <FormSection
                step={2}
                title="Datos de la garantía"
                description="Definí la categoría, el tipo y los detalles del caso."
              >
                <div className="space-y-5">
                  {/* Categoría (dónde originó el defecto). Catálogo del backend:
                      aparecerán solas las categorías nuevas. */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      // ✅ sin tipos para la categoría (LABORATORIO por ahora)
                      // el selector queda bloqueado con el aviso, no hereda otros tipos.
                      disabled={saving || warrantyTypeOptions.length === 0}
                      error={errors.warrantyType}
                      placeholder={
                        warrantyTypeOptions.length === 0
                          ? 'Tipos de garantía no definidos para esta categoría'
                          : 'Seleccionar tipo...'
                      }
                      options={warrantyTypeOptions}
                    />
                  </div>

                  {warrantyTypeOptions.length === 0 && (
                    <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                      La categoría <strong>{activeCategory?.label || warrantyCategory}</strong> aún no tiene tipos de
                      garantía definidos. Crea garantías solo desde <strong>Tienda</strong> por el momento.
                    </p>
                  )}

                  {blockedTypeReason && (
                    <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                      {blockedTypeReason}
                    </p>
                  )}

                  {/* Selector único de ojos (solo RX/Transcripción) */}
                  <div className={`reveal ${isRXType ? 'open' : ''}`}>
                    <div className="reveal-inner">
                      <p className="mb-2 text-sm font-medium text-opticolor-gray-700">Ojo(s) afectado(s) *</p>
                      <div
                        className="inline-flex flex-wrap rounded-xl bg-opticolor-gray-100 p-1"
                        role="group"
                        aria-label="Ojos afectados"
                      >
                        {[
                          { key: 'OD', label: 'Ojo Derecho (OD)', active: affectedEyes.includes('OD') },
                          { key: 'OI', label: 'Ojo Izquierdo (OI)', active: affectedEyes.includes('OI') },
                          { key: 'BOTH', label: 'Ambos ojos', active: affectedEyes.length === 2 },
                        ].map(({ key, label, active }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAffectedEyes(key)}
                            disabled={saving}
                            aria-pressed={active}
                            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed ${
                              active
                                ? 'bg-white text-opticolor-red shadow-sm'
                                : 'text-opticolor-gray-600 hover:text-opticolor-gray-900'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {isRXType && affectedEyes.length === 0 && (
                        <p className="mt-2 text-xs text-opticolor-gray-400">
                          Selecciona el ojo u ojos afectados para editar su receta
                        </p>
                      )}

                      {errors.affectedEyes && (
                        <p className="mt-1 animate-fade-in text-sm text-opticolor-red-light">
                          {errors.affectedEyes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Caso del tipo "Error de Tipo de Lente (Material)" */}
                  {isLensMaterial && (
                    <div className="space-y-4 rounded-xl border border-opticolor-gray-200 bg-opticolor-gray-50 p-4">
                      <CaseDecisionCards
                        value={warrantyCase}
                        onChange={setWarrantyCase}
                        disabled={saving}
                        error={errors.warrantyCase}
                      />

                      {warrantyCase === 'SAME_ORDER' && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <Input
                              label="Nuevo código de montura *"
                              placeholder="Ej: M121603"
                              value={newFrameCode}
                              onChange={(e) => setNewFrameCode(e.target.value.toUpperCase())}
                              error={errors.newFrameCode}
                              disabled={saving}
                              className="uppercase"
                            />
                            <CodeLookupStatus lookup={frameLookup} />
                          </div>
                          <div>
                            <Input
                              label="Nuevo código de cristal *"
                              placeholder="Ej: H000014"
                              value={newLensCode}
                              onChange={(e) => setNewLensCode(e.target.value.toUpperCase())}
                              error={errors.newLensCode}
                              disabled={saving}
                              className="uppercase"
                            />
                            <CodeLookupStatus lookup={lensLookup} />
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

                  {/* Observaciones */}
                  <div>
                    <label htmlFor="store-observations" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
                      Observaciones
                    </label>
                    <textarea
                      id="store-observations"
                      value={storeObservations}
                      onChange={(e) => setStoreObservations(e.target.value)}
                      maxLength={300}
                      rows={3}
                      disabled={saving}
                      placeholder="Describe brevemente el caso (máx. 300 caracteres)"
                      className="w-full resize-none rounded-lg border-2 border-opticolor-gray-200 px-4 py-2.5 transition-all duration-200 hover:border-opticolor-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-opticolor-red disabled:cursor-not-allowed disabled:bg-opticolor-gray-50"
                    />
                    <p className="mt-1 text-right text-xs text-opticolor-gray-400">
                      {storeObservations.length}/300
                    </p>
                  </div>
                </div>
              </FormSection>

              {/* ============================================================
                  PASO 3: REVISAR FACTORES ÓPTICOS
              ============================================================ */}
              <FormSection
                step={3}
                title="Prescripción y montura"
                description="Verificá los datos de la orden. Los campos editables dependen del tipo de garantía."
              >
                <div className="space-y-5">
                  {/* Ojos comparables lado a lado (a partir de xl: en lg la
                      columna principal es estrecha y los campos se recortarían) */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <RxEyeSection
                      prefix="OD"
                      title="Ojo Derecho"
                      affected={isRXType ? affectedEyes.includes('OD') : null}
                      orderData={orderData}
                      errors={errors}
                      saving={saving}
                      isFieldDisabled={isFieldDisabled}
                      onFieldChange={handleFieldChange}
                    />
                    <RxEyeSection
                      prefix="OI"
                      title="Ojo Izquierdo"
                      affected={isRXType ? affectedEyes.includes('OI') : null}
                      orderData={orderData}
                      errors={errors}
                      saving={saving}
                      isFieldDisabled={isFieldDisabled}
                      onFieldChange={handleFieldChange}
                    />
                  </div>

                  {/* Medidas de montura */}
                  <div>
                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-opticolor-gray-700">
                      <Ruler className="h-4 w-4 text-opticolor-gray-400" aria-hidden="true" />
                      Medidas de la Montura
                    </p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {[
                        { field: 'montura_horizontal', label: 'Horizontal' },
                        { field: 'montura_vertical', label: 'Vertical' },
                        { field: 'montura_puente', label: 'Puente' },
                        { field: 'montura_diametro_max', label: 'Diámetro Máx.' },
                      ].map((f) => (
                        <Input
                          key={f.field}
                          label={f.label}
                          type="number"
                          step="0.1"
                          value={orderData[f.field] ?? ''}
                          onChange={(e) => handleFieldChange(f.field, e.target.value)}
                          disabled={isFieldDisabled(f.field) || saving}
                          className="tabular-nums"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </FormSection>
            </div>
          )}
        </div>

        {/* Panel lateral de resumen (desktop) */}
        {orderData && (
          <OrderSummaryPanel
            className="hidden lg:block"
            order={summaryOrder}
            selections={selections}
            checklist={checklist}
            footer={saveButton}
            footerNote={saving ? 'Guardando…' : saveDisabledReason}
          />
        )}
      </div>

      {/* Resumen compacto para móvil (debajo del flujo) */}
      {orderData && (
        <OrderSummaryPanel
          className="mt-6 lg:hidden"
          order={summaryOrder}
          selections={selections}
          checklist={checklist}
        />
      )}

      {/* Barra sticky de guardado (móvil) */}
      <StickyActionBar visible={!!orderData} reason={saving ? 'Guardando…' : saveDisabledReason}>
        {saveButton}
      </StickyActionBar>
    </StorePageShell>
  );
};

export default StoreWarranty;