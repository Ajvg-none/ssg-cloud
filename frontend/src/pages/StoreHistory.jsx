// frontend/src/pages/StoreHistory.jsx
import React, { useState, useEffect } from 'react';
import { storeAPI } from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import StatusBadge from '../components/ui/StatusBadge';
import WarrantyDetailModal from '../components/ui/WarrantyDetailModal';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Pagination from '../components/ui/Pagination';
import IconButton from '../components/ui/IconButton';
import StorePageShell from '../components/store/StorePageShell';
import { Eye, Search, RefreshCw } from 'lucide-react';
import { LIMIT_OPTIONS, formatDate } from '../utils/format';

const OrderNumber = ({ code }) => {
  if (!code) return <span className="text-sm text-opticolor-gray-400">-</span>;
  const idx = code.lastIndexOf('-');
  const suffix = idx > 0 ? code.slice(idx + 1) : '';
  const hasRevision = suffix !== '' && /^\d+$/.test(suffix);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={code}>
      <span className="text-sm font-semibold text-opticolor-gray-800 tabular-nums tracking-tight">
        {hasRevision ? code.slice(0, idx) : code}
      </span>
      {hasRevision && (
        <span className="rounded-md border border-opticolor-gray-200 bg-opticolor-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-opticolor-gray-500">
          R{suffix}
        </span>
      )}
    </span>
  );
};

// ✅ NUEVO: filtros de estado con contador (filtrado en cliente, sin tocar endpoint)
const STATUS_FILTERS = [
  { key: 'ALL', label: 'Todas' },
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'PROCESSING', label: 'Procesando' },
  { key: 'COMPLETED', label: 'Completadas' },
  { key: 'ERROR', label: 'Error' },
];

const StoreHistory = () => {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  // ✅ NUEVO: filtro de estado (solo presentación; los datos ya están en cliente)
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadWarranties();
  }, []);

  const loadWarranties = async () => {
    setLoading(true);
    try {
      const response = await storeAPI.getMyWarranties();
      setWarranties(response.data.warranties || []);
    } catch (error) {
      setAlert({
        type: 'error',
        message: error.response?.data?.error || 'Error al cargar el historial'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (warrantyId) => {
    setDetailLoading(true);
    try {
      const response = await storeAPI.getWarrantyDetail(warrantyId);
      setSelectedWarranty(response.data.warranty);
      setIsModalOpen(true);
    } catch (error) {
      setAlert({
        type: 'error',
        message: error.response?.data?.error || 'Error al cargar el detalle'
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedWarranty(null);
  };

  // ✅ NUEVO: contadores por estado (chips de filtro)
  const list = warranties || [];
  const counts = {
    ALL: list.length,
    PENDING: list.filter((w) => w.status === 'PENDING').length,
    PROCESSING: list.filter((w) => w.status === 'PROCESSING').length,
    COMPLETED: list.filter((w) => w.status === 'COMPLETED').length,
    ERROR: list.filter((w) => w.status === 'ERROR').length,
  };

  // Filtro (estado + texto) y paginación en el navegador (el endpoint trae todas las garantías)
  const filteredWarranties = list
    .filter((w) => statusFilter === 'ALL' || w.status === statusFilter)
    .filter((w) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (w.orderNumber || '').toLowerCase().includes(q) ||
        (w.orderData?.cliente_nombre || '').toLowerCase().includes(q)
      );
    });
  const totalPages = Math.max(1, Math.ceil(filteredWarranties.length / limit));
  const safePage = Math.min(page, totalPages);
  const pagedWarranties = filteredWarranties.slice((safePage - 1) * limit, safePage * limit);

  return (
    <StorePageShell className="pb-12">
      {/* Título de la página */}
      <div className="mb-6 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-opticolor-gray-900">
          Historial de garantías
        </h1>
        <p className="mt-1 text-sm text-opticolor-gray-500">
          Consulta el estado de todas las garantías registradas por tu tienda
        </p>
      </div>

      {/* Alertas */}
      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* ✅ NUEVO: chips de estado con contador (filtrado en cliente) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 animate-slide-up" role="group" aria-label="Filtrar por estado">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => { setStatusFilter(f.key); setPage(1); }}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'border-transparent bg-opticolor-red text-white shadow-sm'
                  : 'border-opticolor-gray-200 bg-white text-opticolor-gray-600 hover:border-opticolor-gray-300 hover:text-opticolor-gray-900'
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-opticolor-gray-100 text-opticolor-gray-500'
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabla de Garantías */}
      <Card className="animate-slide-up">
        {/* Toolbar: búsqueda, filas por página y actualizar */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 inset-y-0 my-auto h-4 w-4 text-opticolor-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por OTG o cliente…"
              aria-label="Buscar garantía"
              className="pl-9 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <Select
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
              options={LIMIT_OPTIONS}
              aria-label="Filas por página"
              className="py-2 text-sm"
            />
            <Button variant="secondary" onClick={loadWarranties} disabled={loading} className="px-3 py-2 text-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>
        {loading ? (
          <Spinner size="lg" className="py-12" />
        ) : list.length === 0 ? (
          <EmptyState
            title="No hay garantías registradas"
            description="Cuando registres una garantía, aparecerá aquí"
          />
        ) : filteredWarranties.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description={
              search
                ? `No se encontraron garantías para "${search}"`
                : 'No hay garantías con este estado'
            }
          />
        ) : (
          <>
            {/* Tabla (desktop) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="tbl-min table-fixed">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-opticolor-gray-200">
                    <th># OTG</th>
                    <th>Cliente</th>
                    <th>Fecha de Registro</th>
                    <th className="is-center">Estado</th>
                    <th className="is-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedWarranties.map((warranty) => (
                    <tr key={warranty.id}>
                      <td className="overflow-hidden whitespace-nowrap text-ellipsis">
                        <OrderNumber code={warranty.orderNumber} />
                      </td>
                      <td className="text-sm text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis" title={warranty.orderData?.cliente_nombre || ''}>
                        {warranty.orderData?.cliente_nombre || '-'}
                      </td>
                      <td className="text-sm text-opticolor-gray-500 whitespace-nowrap tabular-nums">
                        {formatDate(warranty.createdAt)}
                      </td>
                      <td className="is-center">
                        <StatusBadge status={warranty.status} />
                      </td>
                      <td className="is-center">
                        <div className="flex items-center justify-center gap-2">
                          <IconButton
                            icon={Eye}
                            label="Ver detalle"
                            onClick={() => handleViewDetail(warranty.id)}
                            disabled={detailLoading && selectedWarranty?.id === warranty.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas (móvil) */}
            <div className="space-y-3 md:hidden">
              {pagedWarranties.map((warranty) => (
                <div key={warranty.id} className="rounded-xl border border-opticolor-gray-200 bg-white p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-2">
                    <OrderNumber code={warranty.orderNumber} />
                    <StatusBadge status={warranty.status} />
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-opticolor-gray-800" title={warranty.orderData?.cliente_nombre || ''}>
                    {warranty.orderData?.cliente_nombre || '-'}
                  </p>
                  <p className="mt-0.5 text-xs text-opticolor-gray-500 tabular-nums">
                    {formatDate(warranty.createdAt)}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewDetail(warranty.id)}
                    disabled={detailLoading && selectedWarranty?.id === warranty.id}
                    className="mt-3 w-full"
                  >
                    <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Ver detalle
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-opticolor-gray-600">
                Mostrando <span className="font-semibold">{(safePage - 1) * limit + 1}–{Math.min(safePage * limit, filteredWarranties.length)}</span> de <span className="font-semibold">{filteredWarranties.length}</span> garantías
              </p>
              <Pagination page={safePage} totalPages={totalPages} onChange={(p) => setPage(p)} />
            </div>
          </>
        )}
      </Card>

      {/* Modal de Detalle */}
      <WarrantyDetailModal isOpen={isModalOpen} onClose={closeModal} warranty={selectedWarranty} />
    </StorePageShell>
  );
};

export default StoreHistory;
