// backend/test-create-warranty.js
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
let tiendaToken = '';

async function runTests() {
  console.log('🚀 Iniciando pruebas de POST /api/store/warranties...\n');

  // 1. Obtener token de Tienda
  try {
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      username: 'tienda001',
      password: 'tienda123'
    });
    tiendaToken = loginRes.data.token;
    console.log('✅ 1. Token de Tienda obtenido.\n');
  } catch (e) {
    console.log('❌ Falló el login inicial. Asegúrate de que el seed se ejecutó.\n');
    return;
  }

  // 2. Probar ruta SIN token (debe fallar con 401)
  try {
    await axios.post(`${API_URL}/store/warranties`, { orderNumber: '123', orderData: {} });
    console.log('❌ 2. FALLÓ: Debería haber rechazado la petición sin token.\n');
  } catch (e) {
    if (e.response?.status === 401) {
      console.log('✅ 2. ÉXITO: Rechazó correctamente sin token (401).\n');
    } else {
      console.log('❌ 2. FALLÓ: Error inesperado.\n');
    }
  }

  // 3. Probar ruta CON token pero con datos inválidos (ej: sin orderData)
  try {
    await axios.post(`${API_URL}/store/warranties`, { orderNumber: '123' }, {
      headers: { Authorization: `Bearer ${tiendaToken}` }
    });
    console.log('❌ 3. FALLÓ: Debería haber rechazado datos faltantes.\n');
  } catch (e) {
    if (e.response?.status === 400 && e.response.data.error.includes('obligatorios')) {
      console.log('✅ 3. ÉXITO: Rechazó correctamente datos faltantes (400).\n');
    } else {
      console.log('❌ 3. FALLÓ: Error inesperado:', e.response?.data, '\n');
    }
  }

  console.log('🏁 Pruebas de ruta de creación de garantía finalizadas.');
}

runTests();