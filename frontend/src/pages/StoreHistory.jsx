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
import StoreHeader from '../components/layout/StoreHeader';
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

const StoreHistory = () => {
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
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

  // Filtro y paginación en el navegador (el endpoint trae todas las garantías)
  const filteredWarranties = (warranties || []).filter((w) => {
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
    <div className="min-h-screen bg-opticolor-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto animate-slide-up">
        {/* ✅ Header con logo, usuario y pestañas de navegación */}
        <StoreHeader />

        {/* Título de la página */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-opticolor-gray-900 mb-2">
            Historial de Garantías
          </h1>
          <p className="text-opticolor-gray-600">
            Consulta el estado de todas las garantías registradas por tu tienda
          </p>
        </div>

        {/* Alertas */}
        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        {/* Tabla de Garantías */}
                <Card>
          {/* Toolbar: búsqueda, filas por página y actualizar */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
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
          ) : warranties.length === 0 ? (
            <EmptyState
              title="No hay garantías registradas"
              description="Cuando registres una garantía, aparecerá aquí"
            />
                    ) : filteredWarranties.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description={`No se encontraron garantías para "${search}"`}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl-min table-fixed">
                  <colgroup>
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '22%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th># OTG</th>
                      <th>Cliente</th>
                      <th>Fecha de Registro</th>
                      <th>Estado</th>
                      <th>Acciones</th>
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
                        <td>
                          <StatusBadge status={warranty.status} />
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewDetail(warranty.id)}
                              disabled={detailLoading && selectedWarranty?.id === warranty.id}
                              className="btn-ghost btn-ghost-neutral"
                              title="Ver detalle"
                            >
                              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                              Detalle
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
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
      </div>
    </div>
  );
};

export default StoreHistory;