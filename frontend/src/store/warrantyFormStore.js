// frontend/src/store/warrantyFormStore.js
import { create } from 'zustand';
import { storeAPI } from '../services/api';

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
      errors: { ...state.errors, warrantyType: null, affectedEyes: null },
    })),
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
  searchOrder: async () => {
    const { orderNumber, loading } = get();
    if (!orderNumber.trim()) {
      set({ alert: { type: 'warning', message: 'Por favor ingresa un número de OTG' } });
      return;
    }
    if (loading) return; // ya hay una sincronización en curso, no duplicar
    const token = get()._searchToken + 1;
    set({ _searchToken: token, loading: true, alert: null, orderData: null, errors: {} });
    try {
      const response = await storeAPI.getOrder(orderNumber);
      if (get()._searchToken !== token) return; // el usuario lanzó otra búsqueda
      set({
        orderData: response.data.order,
        alert: {
          type: 'success',
          message: 'OTG encontrada. Selecciona un tipo de garantía para editar los campos.',
        },
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
      errors: {},
      alert: null,
      saving: false,
    }),
}));

export default useWarrantyFormStore;