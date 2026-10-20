// frontend/src/pages/admin/AdminDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import StatusBadge from '../../components/ui/StatusBadge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import WarrantyDetailModal from '../../components/ui/WarrantyDetailModal';
import { formatDate } from '../../utils/format';

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
    responsibleParty: '',
    startDate: '',
    endDate: '',
  });
  const [stores, setStores] = useState([]);
  const [labs, setLabs] = useState([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [unlockingId, setUnlockingId] = useState(null);

  useEffect(() => {
    loadMeta();
  }, []);

  const loadMeta = async () => {
    try {
      const [storesRes, labsRes] = await Promise.all([
        adminAPI.getStores(),
        adminAPI.getLabs(),
      ]);
      setStores(storesRes.data.stores || []);
      setLabs(labsRes.data.labs || []);
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
      // ✅ NUEVO: 'UNCLASSIFIED' lo interpreta el backend como responsibleParty IS NULL
      if (filters.responsibleParty) params.responsibleParty = filters.responsibleParty;
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
    setFilters({ search: '', storeId: '', labId: '', status: '', warrantyType: '', responsibleParty: '', startDate: '', endDate: '' });
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
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-opticolor-gray-900 mb-2">Dashboard de Garantías</h1>
          <p className="text-opticolor-gray-600">Vista general de todas las garantías del sistema</p>
        </div>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        {/* Filtros */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-opticolor-gray-700">Filtros</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-opticolor-gray-500">Auto-refresh:</span>
              <Select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                options={REFRESH_OPTIONS}
                className="py-1 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Buscar OTG</label>
              <Input
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Número de orden..."
                className="py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Laboratorio</label>
              <Select
                value={filters.labId}
                onChange={(e) => handleFilterChange('labId', e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...labs.map((l) => ({ value: l.id, label: l.name }))]}
                className="py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Tienda</label>
              <Select
                value={filters.storeId}
                onChange={(e) => handleFilterChange('storeId', e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...stores.map((s) => ({ value: s.id, label: `${s.name} (${s.accn})` }))]}
                className="py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Estado</label>
              <Select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                options={STATUS_OPTIONS}
                className="py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Tipo Garantía</label>
              <Select
                value={filters.warrantyType}
                onChange={(e) => handleFilterChange('warrantyType', e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...WARRANTY_TYPES.map((type) => ({ value: type, label: type }))]}
                className="py-2 text-sm"
              />
            </div>
            {/* ✅ NUEVO: filtro por responsable del error (solo informativo) */}
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Responsable</label>
              <Select
                value={filters.responsibleParty}
                onChange={(e) => handleFilterChange('responsibleParty', e.target.value)}
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'TIENDA', label: 'Tienda' },
                  { value: 'LABORATORIO', label: 'Laboratorio' },
                  { value: 'UNCLASSIFIED', label: 'Sin clasificar' },
                ]}
                className="py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Desde</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-opticolor-gray-700 mb-1">Hasta</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} className="px-4 py-2 text-sm">Buscar</Button>
              <Button variant="secondary" onClick={handleClearFilters} className="px-4 py-2 text-sm">Limpiar</Button>
            </div>
          </div>
        </Card>

        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <Card key={status} className={`border-l-4 ${colors[status]} animate-fade-in`} style={{ animationDelay: `${index * 60}ms` }}>
                <p className="text-sm text-opticolor-gray-500">{labels[status]}</p>
                <p className="text-3xl font-bold text-opticolor-gray-900">{count}</p>
              </Card>
            );
          })}
        </div>

        {/* ✅ NUEVO: conteo por responsable del error (client-side sobre la página cargada) */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { key: 'TIENDA', label: 'Tienda', color: 'border-l-blue-500', icon: '🏪' },
            { key: 'LABORATORIO', label: 'Laboratorio', color: 'border-l-teal-500', icon: '🧪' },
            { key: 'UNCLASSIFIED', label: 'Sin clasificar', color: 'border-l-opticolor-gray-400', icon: '❓' },
          ].map((r, index) => {
            const count =
              r.key === 'UNCLASSIFIED'
                ? (warranties || []).filter((w) => !w.responsibleParty).length
                : (warranties || []).filter((w) => w.responsibleParty === r.key).length;
            return (
              <Card key={r.key} className={`border-l-4 ${r.color} animate-fade-in`} style={{ animationDelay: `${index * 60}ms` }}>
                <p className="text-sm text-opticolor-gray-500">{r.icon} {r.label}</p>
                <p className="text-3xl font-bold text-opticolor-gray-900">{count}</p>
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
                <table className="tbl-min table-fixed">
                  <colgroup>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '11%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th># OTG</th>
                      <th>Tienda</th>
                      <th>Laboratorio</th>
                      <th>Tipo</th>
                      {/* ✅ NUEVO: responsable del error */}
                      <th className="is-center">Responsable</th>
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
                        {/* ✅ NUEVO: badge del responsable del error */}
                        <td className="is-center">
                          {w.responsibleParty === 'TIENDA' ? (
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">🏪 Tienda</span>
                          ) : w.responsibleParty === 'LABORATORIO' ? (
                            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">🧪 Lab</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-opticolor-gray-200 bg-opticolor-gray-100 px-2 py-0.5 text-[11px] font-semibold text-opticolor-gray-500">—</span>
                          )}
                        </td>
                        <td className="is-center"><StatusBadge status={w.status} /></td>
                        <td className="text-sm text-opticolor-gray-500 whitespace-nowrap tabular-nums">{formatDate(w.createdAt)}</td>
                        <td className="is-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => { setSelectedWarranty(w); setDetailModalOpen(true); }}
                              className="btn-ghost btn-ghost-neutral"
                              title="Ver detalle"
                            >
                              Ver Detalle
                            </button>
                            {/* ✅ NUEVO: las garantías "nueva OT pagada" no se desbloquean */}
                            {w.requiresVca !== false && (
                              <button
                                onClick={() => handleUnlock(w)}
                                disabled={unlockingId === w.id}
                                className="btn-ghost btn-ghost-neutral"
                                title="Desbloquear para reproceso (solo admin)"
                              >
                                {unlockingId === w.id ? 'Desbloqueando…' : 'Desbloquear'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Paginación */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
                <p className="text-sm text-opticolor-gray-600">
                  Mostrando {((pagination.page - 1) * pagination.limit) + 1}-
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
                </p>
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onChange={(page) => loadWarranties(page)}
                />
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
    </div>
  );
};

export default AdminDashboard;