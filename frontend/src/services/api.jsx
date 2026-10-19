// frontend/src/services/api.jsx
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  // Red de seguridad: sin esto, una petición colgada deja el spinner de la UI
  // girando indefinidamente (la búsqueda de una OTG en GesVision puede tardar).
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar el token automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Excluimos la petición de login para que el error llegue al componente
      // en lugar de recargar la página completa
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================
// API DE AUTENTICACIÓN
// ============================================================
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// ============================================================
// API DE TIENDA
// ✅ ÚNICA declaración de storeAPI (se eliminó la duplicada)
// ============================================================
export const storeAPI = {
  getOrder: (orderNumber) => api.get(`/store/order/${orderNumber}`),
  createWarranty: (data) => api.post('/store/warranties', data),
  getMyWarranties: () => api.get('/store/warranties'),
  getWarrantyDetail: (id) => api.get(`/store/warranties/${id}`),
  // ✅ NUEVO: auto-impresión del ticket desde tienda
  getTicketBuffer: (warrantyId) => api.get(`/store/ticket-buffer/${warrantyId}`),
  completeWarranty: (warrantyId) => api.post(`/store/warranties/${warrantyId}/complete`),
};

// ============================================================
// API DE LABORATORIO
// ============================================================
export const labAPI = {
  getWarranties: (params) => api.get('/lab/warranties', { params }),
  getTicketBuffer: (warrantyId) => api.get(`/lab/ticket-buffer/${warrantyId}`),
  completeWarranty: (warrantyId) => api.post(`/lab/warranties/${warrantyId}/complete`),
  testTicket: () => api.get('/lab/test-ticket'),
  printConfig: () => api.get('/lab/print-config'),
  getMyStores: () => api.get('/lab/stores'),
};

// ============================================================
// API DE ADMIN
// ============================================================
export const adminAPI = {
  // Laboratorios
  getLabs: () => api.get('/admin/labs'),
  createLab: (data) => api.post('/admin/labs', data),
  updateLab: (id, data) => api.put(`/admin/labs/${id}`, data),
  deleteLab: (id) => api.delete(`/admin/labs/${id}`),
  regenerateLabApiKey: (id) => api.post(`/admin/labs/${id}/regenerate-key`),
  // Tiendas
  getStores: () => api.get('/admin/stores'),
  createStore: (data) => api.post('/admin/stores', data),
  updateStore: (id, data) => api.put(`/admin/stores/${id}`, data),
  // Usuarios
  getUsers: (params) => api.get('/admin/users', { params }),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetUserPassword: (userId, newPassword) =>
    api.post(`/admin/users/${userId}/reset-password`, { newPassword }),
  // Dashboard de Garantías
  getWarrantiesDashboard: (params) => api.get('/admin/warranties', { params }),
  unlockWarranty: (id) => api.post(`/admin/warranties/${id}/unlock`),
};

export default api;