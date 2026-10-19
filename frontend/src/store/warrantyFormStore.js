// frontend/src/store/warrantyFormStore.js
import { create } from 'zustand';
import { storeAPI } from '../services/api';

// ✅ NUEVO: tipo "Error de Tipo de Lente (Material)" (misma constante que el backend).
const LENS_MATERIAL_TYPE = 'Error de Tipo de Lente (Material)';

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
  // ✅ Selección ÚNICA de ojo afectado (OD | OI | BOTH) o ninguno
  setAffectedEyes: (option) =>
    set((state) => {
      const next =
        option === 'BOTH' ? ['OD', 'OI']
        : option === 'OD' ? ['OD']
        : option === 'OI' ? ['OI']
        : [];
      return {
        affectedEyes: next,
        errors: { ...state.errors, affectedEyes: null },
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