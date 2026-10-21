// frontend/src/pages/admin/AdminDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI, warrantyCategoryAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import StatusBadge from '../../components/ui/StatusBadge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import IconButton from '../../components/ui/IconButton';
import PageHeader from '../../components/ui/PageHeader';
import WarrantyDetailModal from '../../components/ui/WarrantyDetailModal';
import { Eye, LockOpen } from 'lucide-react';
import { formatDate, warrantyCategoryLabel } from '../../utils/format';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'PROCESSING', label: 'Procesando' },
  { value: 'COMPLETED', label: 'Completada' },
  { value: 'ERROR', label: 'Error' },
];

const REFRESH_OPTIONS = [
  { value: 0, label: 'OFF' },
  { value: 5, label: '5 seg' },
  { value: 10, label: '10 seg' },
  { value: 30, label: '30 seg' },
];

// ✅ CORREGIDO: Solo los 3 tipos reales que usa el panel de Tienda.
// Deben coincidir EXACTAMENTE con los valores guardados en la BD
// (el backend filtra por coincidencia exacta de texto).
const WARRANTY_TYPES = [
  'Error de Medida',
  'Error de Transcripcion',
  'Error de RX',
  'Error de Tipo de Lente (Material)',
];

const AdminDashboard = () => {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [filters, setFilters] = useState({
    search: '',
    storeId: '',
    labId: '',
    status: '',
    warrantyType: '',
    // ✅ NUEVO: categoría (dónde originó el defecto)
    category: '',
    startDate: '',
    endDate: '',
  });
  const [stores, setStores] = useState([]);
  const [labs, setLabs] = useState([]);
  // ✅ NUEVO: catálogo de categorías desde el backend (aparecen las nuevas solas)
  const [categories, setCategories] = useState([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [unlockingId, setUnlockingId] = useState(null);

  useEffect(() => {
    loadMeta();
  }, []);

  const loadMeta = async () => {
    try {
      const [storesRes, labsRes, categoriesRes] = await Promise.all([
        adminAPI.getStores(),
        adminAPI.getLabs(),
        // ✅ NUEVO: catálogo de categorías (no bloquea: si falla, queda vacío)
        warrantyCategoryAPI.list(),
      ]);
      setStores(storesRes.data.stores || []);
      setLabs(labsRes.data.labs || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (e) {
      // Silencioso — los dropdowns simplemente estarán vacíos
    }
  };

  const loadWarranties = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit };
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.storeId) params.storeId = filters.storeId;
      if (filters.labId) params.labId = filters.labId;
      if (filters.status) params.status = filters.status;
      if (filters.warrantyType) params.warrantyType = filters.warrantyType;
      if (filters.category) params.category = filters.category; // ✅ NUEVO
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await adminAPI.getWarrantiesDashboard(params);
      setWarranties(res.data.warranties || []);
      setPagination(res.data.pagination);
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al cargar garantías' });
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    loadWarranties(1);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval === 0) return;
    const id = setInterval(() => loadWarranties(pagination.page), refreshInterval * 1000);
    return () => clearInterval(id);
  }, [refreshInterval, pagination.page, loadWarranties]);

  const handleClearFilters = () => {
    setFilters({ search: '', storeId: '', labId: '', status: '', warrantyType: '', category: '', startDate: '', endDate: '' });
  };

  // Desbloquear/reprocesar: solo ADMIN. Devuelve la garantía a PENDING y regenera el VCA.
  const handleUnlock = async (warranty) => {
    const ok = window.confirm(
      `¿Desbloquear la orden ${warranty.orderNumber} para que el laboratorio la procese de nuevo?\n\n` +
      `Se reseteará a PENDING y se regenerará el archivo VCA.`
    );
    if (!ok) return;
    setUnlockingId(warranty.id);
    try {
      const res = await adminAPI.unlockWarranty(warranty.id);
      const vca = res.data?.vca;
      const vcaMsg = vca?.delivered
        ? (vca.alreadyExisted ? 'VCA ya existía (sin cambios)' : 'VCA regenerado')
        : `VCA: ${vca?.error || vca?.skipped || 'no generado'}`;
      setAlert({ type: 'success', message: `Orden ${warranty.orderNumber} desbloqueada. ${vcaMsg}.` });
      loadWarranties(pagination.page);
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al desbloquear la orden' });
    } finally {
      setUnlockingId(null);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearch = () => {
    loadWarranties(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Dashboard de Garantías"
        description="Vista general de todas las garantías del sistema"
      />

      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Filtros */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-opticolor-gray-900">Filtros</h2>
            <p className="mt-0.5 text-sm text-opticolor-gray-500">Acota la búsqueda por tienda, estado o fecha</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-refresh" className="text-xs font-medium text-opticolor-gray-500">
              Auto-refresh
            </label>
            <div className="w-24">
              <Select
                id="admin-refresh"
                size="sm"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                options={REFRESH_OPTIONS}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <label htmlFor="admin-search" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Buscar OTG
            </label>
            <Input
              id="admin-search"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Número de orden..."
            />
          </div>

          <div className="xl:col-span-2">
            <label htmlFor="admin-lab" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Laboratorio
            </label>
            <Select
              id="admin-lab"
              value={filters.labId}
              onChange={(e) => handleFilterChange('labId', e.target.value)}
              options={[{ value: '', label: 'Todos' }, ...labs.map((l) => ({ value: l.id, label: l.name }))]}
            />
          </div>

          <div className="xl:col-span-2">
            <label htmlFor="admin-store" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Tienda
            </label>
            <Select
              id="admin-store"
              value={filters.storeId}
              onChange={(e) => handleFilterChange('storeId', e.target.value)}
              options={[{ value: '', label: 'Todas' }, ...stores.map((s) => ({ value: s.id, label: `${s.name} (${s.accn})` }))]}
            />
          </div>

          <div className="xl:col-span-2">
            <label htmlFor="admin-status" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Estado
            </label>
            <Select
              id="admin-status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="xl:col-span-2">
            <label htmlFor="admin-category" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Categoría
            </label>
            <Select
              id="admin-category"
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              options={[{ value: '', label: 'Todas' }, ...categories.map((c) => ({ value: c.key, label: c.label }))]}
            />
          </div>

          <div className="xl:col-span-4">
            <label htmlFor="admin-type" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Tipo Garantía
            </label>
            <Select
              id="admin-type"
              value={filters.warrantyType}
              onChange={(e) => handleFilterChange('warrantyType', e.target.value)}
              options={[{ value: '', label: 'Todos' }, ...WARRANTY_TYPES.map((type) => ({ value: type, label: type }))]}
            />
          </div>

          <div className="xl:col-span-2">
            <label htmlFor="admin-start" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Desde
            </label>
            <Input
              id="admin-start"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <label htmlFor="admin-end" className="mb-1 block text-sm font-medium text-opticolor-gray-700">
              Hasta
            </label>
            <Input
              id="admin-end"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-4">
            <Button onClick={handleSearch} className="h-11 px-5 text-sm">
              Buscar
            </Button>
            <Button variant="secondary" onClick={handleClearFilters} className="h-11 px-5 text-sm">
              Limpiar
            </Button>
          </div>
        </div>
      </Card>

      {/* Resumen */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR'].map((status, index) => {
          const count = (warranties || []).filter((w) => w.status === status).length;
          const colors = {
            PENDING: 'border-l-yellow-500',
            PROCESSING: 'border-l-blue-500',
            COMPLETED: 'border-l-green-500',
            ERROR: 'border-l-red-500',
          };
          const labels = { PENDING: 'Pendientes', PROCESSING: 'Procesando', COMPLETED: 'Completadas', ERROR: 'Errores' };
          return (
            <Card
              key={status}
              className={`flex flex-col gap-1 border-l-4 ${colors[status]} animate-fade-in`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                {labels[status]}
              </p>
              <p className="text-2xl font-bold tabular-nums text-opticolor-gray-900 sm:text-3xl">{count}</p>
            </Card>
          );
        })}
      </div>

        {/* Tabla */}
        <Card>
          {loading ? (
            <Spinner size="lg" className="py-12" />
          ) : warranties.length === 0 ? (
            <EmptyState
              title="No hay garantías"
              description="No se encontraron garantías con los filtros seleccionados"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl-min table-fixed min-w-[1000px]">
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th># OTG</th>
                      <th>Tienda</th>
                      <th>Laboratorio</th>
                      <th>Tipo</th>
                      <th>Categoría</th>
                      <th className="is-center">Estado</th>
                      <th>Fecha</th>
                      <th className="is-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warranties.map((w) => (
                      <tr key={w.id}>
                        <td className="font-mono text-sm text-opticolor-gray-800 overflow-hidden whitespace-nowrap text-ellipsis">{w.orderNumber}</td>
                        <td className="text-sm text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis" title={w.store?.name || ''}>{w.store?.name || '-'}</td>
                        <td className="text-sm text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis" title={w.lab?.name || ''}>{w.lab?.name || '-'}</td>
                        <td className="text-sm text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis max-w-[120px]" title={w.warrantyType || ''}>{w.warrantyType || '-'}</td>
                        <td className="text-xs font-medium text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis" title={warrantyCategoryLabel(w.category)}>
                          {warrantyCategoryLabel(w.category)}
                        </td>
                        <td className="is-center"><StatusBadge status={w.status} /></td>
                        <td className="text-sm text-opticolor-gray-500 whitespace-nowrap tabular-nums">{formatDate(w.createdAt)}</td>
                        <td className="is-center">
                          <div className="flex items-center justify-center gap-2">
                            <IconButton
                              icon={Eye}
                              label="Ver detalle"
                              onClick={() => {
                                setSelectedWarranty(w);
                                setDetailModalOpen(true);
                              }}
                            />
                            {/* ✅ NUEVO: las garantías "nueva OT pagada" no se desbloquean */}
                            {w.requiresVca !== false && (
                              <IconButton
                                icon={LockOpen}
                                label="Desbloquear para reproceso"
                                variant="warning"
                                onClick={() => handleUnlock(w)}
                                loading={unlockingId === w.id}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Paginación */}
              <div className="mt-5 flex flex-col gap-3 border-t border-opticolor-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-opticolor-gray-500">
                  Mostrando{' '}
                  <span className="font-semibold text-opticolor-gray-700">
                    {(pagination.page - 1) * pagination.limit + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  de <span className="font-semibold text-opticolor-gray-700">{pagination.total}</span> garantías
                </p>
                <div className="max-w-full overflow-x-auto">
                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    onChange={(page) => loadWarranties(page)}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Modal Detalle */}
        <WarrantyDetailModal
          isOpen={detailModalOpen}
          onClose={() => { setDetailModalOpen(false); setSelectedWarranty(null); }}
          warranty={selectedWarranty}
        />
    </div>
  );
};

export default AdminDashboard;