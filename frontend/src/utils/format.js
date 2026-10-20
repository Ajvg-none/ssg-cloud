// frontend/src/utils/format.js
// Utilidades de formato y constantes compartidas entre páginas.

export const LIMIT_OPTIONS = [
  { value: 5, label: '5 filas' },
  { value: 10, label: '10 filas' },
  { value: 20, label: '20 filas' },
  { value: 50, label: '50 filas' },
];

export const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ============================================================
// ✅ NUEVO: etiquetas de CATEGORÍA de garantía (dónde originó el defecto).
// SOLO para mostrar en las filas de listados — la fuente de verdad del
// catálogo (claves destacadas y etiquetas oficiales) es el backend vía
// GET /api/warranty-categories. Si llega una clave nueva aún no maapeada,
// se muestra la clave cruda (sin editar código por categoría).
// ============================================================
export const warrantyCategoryLabel = (categoryKey) => {
  const LABELS = { TIENDA: 'Tienda', LABORATORIO: 'Laboratorio' };
  return categoryKey ? (LABELS[categoryKey] || categoryKey) : '-';
};
