// frontend/src/store/warrantyFormStore.js
import { create } from 'zustand';
import { storeAPI, warrantyCategoryAPI } from '../services/api';

// ✅ NUEVO: tipo "Error de Tipo de Lente (Material)" (misma constante que el backend).
const LENS_MATERIAL_TYPE = 'Error de Tipo de Lente (Material)';

// ✅ NUEVO: categoría de garantía (dónde originó el defecto).
// Compatibilidad: sin selección explícita nace TIENDA (default histórico).
const DEFAULT_CATEGORY = 'TIENDA';

// Fallback de tipos si la API de categorías no responde (los vigentes hoy).
const FALLBACK_TIENDA_TYPES = [
  'Error de Medida',
  'Error de Transcripcion',
  'Error de RX',
  'Error de Tipo de Lente (Material)',
];

// ✅ El contrato LABORATORIO ya es definitivo: 3 tipos habilitados, sin VCA ni
// ticket (la Orden A4 la imprime la tienda) y nace COMPLETED.
const FALLBACK_LAB_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];

// Campos de graduación/medidas propios de cada ojo. Se usan para limpiar el
// estado cuando el usuario desmarca un ojo y para sanear el payload.
export const EYE_FIELDS = {
  OD: [
    'od_esfera', 'od_cilindro', 'od_eje', 'od_adicion',
    'od_dp_centro', 'od_dp_cerca', 'od_dp_unico', 'altura_od',
  ],
  OI: [
    'oi_esfera', 'oi_cilindro', 'oi_eje', 'oi_adicion',
    'oi_dp_centro', 'oi_dp_cerca', 'oi_dp_unico', 'altura_oi',
  ],
};

/**
 * Devuelve una copia de orderData sin los campos de los ojos indicados.
 * @param {Object|null} orderData
 * @param {string[]} eyes - ['OD'], ['OI'] o ambos.
 * @returns {Object|null}
 */
export const clearEyeData = (orderData, eyes = []) => {
  if (!orderData) return orderData;
  const next = { ...orderData };
  eyes.forEach((eye) => {
    (EYE_FIELDS[eye] || []).forEach((field) => {
      delete next[field];
    });
  });
  return next;
};

/**
 * 🌐 STORE GLOBAL del formulario "Nueva Garantía".
 *
 * ¿Por qué existe? Antes todo el estado vivía en useState dentro de
 * StoreWarranty.jsx. Al navegar a "Historial", React desmontaba el
 * componente y la sincronización en curso se perdía.
 *
 * Con Zustand, el estado y la petición viven FUERA del árbol de React:
 * la búsqueda continúa en segundo plano y, al regresar, el formulario
 * aparece exactamente como quedó (cargando o con el resultado).
 */
const useWarrantyFormStore = create((set, get) => ({
  // ---------- Estado del formulario ----------
  orderNumber: '',
  orderData: null,
  // ✅ NUEVO: categoría de garantía (TIENDA | LABORATORIO), del catálogo API
  warrantyCategory: DEFAULT_CATEGORY,
  // ✅ NUEVO: catálogo de categorías cargado del backend
  // [{ key, label, warrantyTypes }] — aparecen solas las categorías nuevas.
  categories: [],
  warrantyType: '',
  storeObservations: '',
  // ✅ Ojos afectados para Error de RX / Transcripción.
  // Array con 'OD' y/o 'OI'. Vacío = sin selección (afectedEyes null).
  affectedEyes: [],
  // ✅ NUEVO: tipo "Error de Tipo de Lente (Material)".
  // warrantyCase: 'SAME_ORDER' (misma OT, el cliente NO paga) | 'NEW_ORDER'
  // (nueva OT pagada) | null mientras no se elija.
  warrantyCase: null,
  newFrameCode: '',
  newLensCode: '',
  newOrderNumber: '',
  errors: {},
  loading: false,
  saving: false,
  alert: null,
  // Token interno: ignora respuestas de búsquedas obsoletas
  _searchToken: 0,

  // ---------- Setters ----------
  setOrderNumber: (value) => set({ orderNumber: value }),
  // ✅ NUEVO: cambiar de categoría reinicia el tipo y los campos dependientes
  // (la lista de tipos vigentes puede diferir entre categorías).
  setWarrantyCategory: (value) =>
    set((state) => ({
      warrantyCategory: value,
      warrantyType: '',
      affectedEyes: [],
      warrantyCase: null,
      newFrameCode: '',
      newLensCode: '',
      newOrderNumber: '',
      errors: {
        ...state.errors,
        warrantyType: null,
        affectedEyes: null,
        warrantyCase: null,
        newFrameCode: null,
        newLensCode: null,
        newOrderNumber: null,
      },
    })),
  setWarrantyType: (value) =>
    set((state) => ({
      warrantyType: value,
      // ✅ Al cambiar el tipo de garantía, la selección de ojos vuelve a vacía
      affectedEyes: [],
      // ✅ NUEVO: el caso y los códigos del tipo Lente (Material) se reinician
      warrantyCase: null,
      newFrameCode: '',
      newLensCode: '',
      newOrderNumber: '',
      errors: {
        ...state.errors,
        warrantyType: null,
        affectedEyes: null,
        warrantyCase: null,
        newFrameCode: null,
        newLensCode: null,
        newOrderNumber: null,
      },
    })),
  // ✅ NUEVO: caso del tipo "Error de Tipo de Lente (Material)".
  // Al cambiar de caso se limpian los campos que dejan de aplicar.
  setWarrantyCase: (value) =>
    set((state) => ({
      warrantyCase: value,
      newFrameCode: value === 'SAME_ORDER' ? state.newFrameCode : '',
      newLensCode: value === 'SAME_ORDER' ? state.newLensCode : '',
      newOrderNumber: value === 'NEW_ORDER' ? state.newOrderNumber : '',
      errors: {
        ...state.errors,
        warrantyCase: null,
        newFrameCode: null,
        newLensCode: null,
        newOrderNumber: null,
      },
    })),
  setNewFrameCode: (value) =>
    set((state) => ({ newFrameCode: value, errors: { ...state.errors, newFrameCode: null } })),
  setNewLensCode: (value) =>
    set((state) => ({ newLensCode: value, errors: { ...state.errors, newLensCode: null } })),
  setNewOrderNumber: (value) =>
    set((state) => ({ newOrderNumber: value, errors: { ...state.errors, newOrderNumber: null } })),
  // ✅ Selección independiente de ojos (OD | OI | ambos). Volver a pulsar un
  // ojo activo lo desmarca y limpia sus campos para no enviar datos residuales.
  setAffectedEyes: (option) =>
    set((state) => {
      const prev = state.affectedEyes;
      let next = [];

      if (option === 'BOTH') {
        next = prev.length === 2 ? [] : ['OD', 'OI'];
      } else if (option === 'OD' || option === 'OI') {
        next = prev.includes(option)
          ? prev.filter((eye) => eye !== option)
          : [...prev, option];
      }

      const removed = ['OD', 'OI'].filter(
        (eye) => prev.includes(eye) && !next.includes(eye)
      );

      const errors = { ...state.errors, affectedEyes: null };
      removed.forEach((eye) => {
        (EYE_FIELDS[eye] || []).forEach((field) => {
          delete errors[field];
        });
      });

      return {
        affectedEyes: next,
        orderData: clearEyeData(state.orderData, removed),
        errors,
      };
    }),
  setStoreObservations: (value) => set({ storeObservations: value }),
  setAlert: (value) => set({ alert: value }),
  clearAlert: () => set({ alert: null }),
  setErrors: (value) => set({ errors: value }),
  setSaving: (value) => set({ saving: value }),
  handleFieldChange: (field, value) =>
    set((state) => ({
      orderData: state.orderData ? { ...state.orderData, [field]: value } : state.orderData,
      errors: { ...state.errors, [field]: null },
    })),

  // ✅ NUEVO: catálogo de categorías desde el backend (una sola llamada).
  // Si falla: aviso suave y fallback estático (garantía igual se puede crear).
  loadCategories: async () => {
    if (get().categories.length) return; // ya cargado
    try {
      const response = await warrantyCategoryAPI.list();
      set({ categories: response.data.categories || [] });
    } catch {
      set({
        categories: [
          {
            key: 'TIENDA',
            label: 'Tienda',
            warrantyTypes: FALLBACK_TIENDA_TYPES,
            blockedWarrantyTypes: [],
            blockedReason: null,
          },
          {
            key: 'LABORATORIO',
            label: 'Laboratorio',
            warrantyTypes: FALLBACK_LAB_TYPES,
            blockedWarrantyTypes: [],
            blockedReason: null,
          },
        ],
        alert: { type: 'warning', message: 'No se pudo cargar el catálogo de categorías; usando valores por defecto.' },
      });
    }
  },

  // ---------- Búsqueda (continúa en segundo plano) ----------
  searchOrder: async (overrideOrderNumber) => {
    // ✅ NUEVO: en el Caso 2 (nueva OT pagada) el frontend pasa la OT que el
    // usuario tipeó en el bloque del caso; los datos cargados son informativos.
    const identifier = (overrideOrderNumber || get().orderNumber || '').toString().trim();
    if (!identifier) {
      set({ alert: { type: 'warning', message: 'Por favor ingresa un número de OTG' } });
      return;
    }
    const { loading } = get();
    if (loading) return; // ya hay una sincronización en curso, no duplicar
    const token = get()._searchToken + 1;
    set({ _searchToken: token, loading: true, alert: null, orderData: null, errors: {}, orderNumber: identifier });
    try {
      const response = await storeAPI.getOrder(identifier);
      if (get()._searchToken !== token) return; // el usuario lanzó otra búsqueda
      // ✅ NUEVO: mensaje contextual en el Caso 2 (datos informativos, read-only)
      const { warrantyType, warrantyCase } = get();
      const message = warrantyType === LENS_MATERIAL_TYPE && warrantyCase === 'NEW_ORDER'
        ? 'Nueva OT cargada. Los datos son solo informativos: registrá la nueva orden pagada.'
        : 'OTG encontrada. Selecciona un tipo de garantía para editar los campos.';
      set({
        orderData: response.data.order,
        alert: { type: 'success', message },
      });
    } catch (error) {
      if (get()._searchToken !== token) return;
      const message =
        error.code === 'ECONNABORTED'
          ? 'La búsqueda tardó demasiado. Verifica el número de OTG e intenta de nuevo.'
          : error.response?.data?.error || error.response?.data?.details || 'Error al buscar la OTG';
      set({ orderData: null, alert: { type: 'error', message } });
    } finally {
      // Garantiza que el spinner se apague SIEMPRE (aunque la promesa falle),
      // salvo que una búsqueda más nueva ya sea la dueña del estado.
      if (get()._searchToken === token) set({ loading: false });
    }
  },

  // ---------- Reset después de guardar con éxito ----------
  resetForm: () =>
    set({
      orderNumber: '',
      orderData: null,
      warrantyCategory: DEFAULT_CATEGORY, // ✅ NUEVO: vuelve a la categoría default
      warrantyType: '',
      storeObservations: '',
      affectedEyes: [],
      // ✅ NUEVO: campos del tipo "Error de Tipo de Lente (Material)"
      warrantyCase: null,
      newFrameCode: '',
      newLensCode: '',
      newOrderNumber: '',
      errors: {},
      alert: null,
      saving: false,
    }),
}));

export default useWarrantyFormStore;