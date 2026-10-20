// frontend/src/pages/lab/LabDashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { labAPI, warrantyCategoryAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import WarrantyDetailModal from '../../components/ui/WarrantyDetailModal';
import { Printer, CheckCircle2, XCircle, Search, RefreshCw, Eye } from 'lucide-react';
import { connectQZ, printRawData, isQZActive } from '../../services/qzprintService';
import { LIMIT_OPTIONS, formatDate, warrantyCategoryLabel } from '../../utils/format';

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

const LabDashboard = () => {
  // Estado del sistema
  const [printConfig, setPrintConfig] = useState({ printerName: '', vcaNetworkPath: '', vcaEnabled: true });
  const [qzConnected, setQzConnected] = useState(false);
  const [testPrintResult, setTestPrintResult] = useState(null);

  // Garantías
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [stores, setStores] = useState([]);
  // ✅ NUEVO: filtro de categoría (dónde originó el defecto)
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [refreshInterval, setRefreshInterval] = useState(0);

  // Modales
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [reprintModalOpen, setReprintModalOpen] = useState(false);
  const [warrantyToReprint, setWarrantyToReprint] = useState(null);
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [warrantyToProcess, setWarrantyToProcess] = useState(null);

  useEffect(() => {
    loadMeta();
    loadPrintConfig();
    setQzConnected(isQZActive());
    loadWarranties(1);
  }, []);

  const loadMeta = async () => {
    try {
      const res = await labAPI.getMyStores();
      setStores(res.data.stores || []);
    } catch (e) { /* silencioso */ }
    try {
      // ✅ NUEVO: catálogo de categorías del backend (aparecen las nuevas solas)
      const res = await warrantyCategoryAPI.list();
      setCategories(res.data.categories || []);
    } catch (e) { /* silencioso: el filtro simplemente queda vacío */ }
  };

  const loadPrintConfig = async () => {
    try {
      const res = await labAPI.printConfig();
      setPrintConfig(res.data);
    } catch (e) { /* silencioso */ }
  };

  const loadWarranties = useCallback(async (page = 1, limitOverride) => {
    setLoading(true);
    try {
      const params = { page, limit: limitOverride ?? pagination.limit };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (storeFilter) params.storeId = storeFilter;
      if (categoryFilter) params.category = categoryFilter; // ✅ NUEVO
      const res = await labAPI.getWarranties(params);
      setWarranties(res.data.warranties || []);
      setPagination(res.data.pagination);
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al cargar garantías' });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, storeFilter, categoryFilter, pagination.limit]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval === 0) return;
    const id = setInterval(() => {
      loadPrintConfig();
      setQzConnected(isQZActive());
      loadWarranties(pagination.page);
    }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [refreshInterval, pagination.page, loadWarranties]);

  const handleSearch = () => loadWarranties(1);

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit }));
    loadWarranties(1, newLimit);
  };

  // Re-consulta automática con debounce al cambiar filtros
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const timer = setTimeout(() => loadWarranties(1), 400);
    return () => clearTimeout(timer);
  }, [search, statusFilter, storeFilter, categoryFilter]);

  // ✅ Abre el modal de confirmación de procesamiento
  const handleProcessClick = (warranty) => {
    setWarrantyToProcess(warranty);
    setProcessModalOpen(true);
  };

  // ✅ ÚNICA declaración de handleProcess (se eliminó la duplicada)
  const handleProcess = (warrantyId, orderNumber) => {
    const warranty = warranties.find((w) => w.id === warrantyId);
    if (warranty) {
      handleProcessClick(warranty);
    }
  };

  const handleReprintClick = (warranty) => {
    setWarrantyToReprint(warranty);
    setReprintModalOpen(true);
  };

  const handleReprintConfirm = async () => {
    if (!warrantyToReprint) return;
    setReprintModalOpen(false);
    try {
      await connectQZ();
      const response = await labAPI.getTicketBuffer(warrantyToReprint.id);
      const { ticketBase64, printerName } = response.data;
      await printRawData(printerName, ticketBase64);
      setAlert({ type: 'success', message: `Ticket de orden ${warrantyToReprint.orderNumber} reimpreso.` });
      setWarrantyToReprint(null);
    } catch (e) {
      console.error(e);
      setAlert({ type: 'error', message: e.response?.data?.error || e.message || 'Error al reimprimir' });
      setWarrantyToReprint(null);
    }
  };

  const handleProcessConfirm = async () => {
    if (!warrantyToProcess) return;
    setProcessModalOpen(false);
    setProcessingId(warrantyToProcess.id);
    setAlert(null);
    try {
      // 1. Conectar con QZ Tray (esto abre el websocket local)
      await connectQZ();

      // 2. Pedir al backend que genere el ticket (NO imprime todavía)
      const response = await labAPI.getTicketBuffer(warrantyToProcess.id);
      const { ticketBase64, printerName } = response.data;

      // 3. IMPRIMIR FÍSICAMENTE con QZ Tray
      // Esto envía los bytes directamente a la impresora Bixolon
      await printRawData(printerName, ticketBase64);

      // 4. Avisar al backend que ya terminamos (Marcar como COMPLETED)
      // Nota: el archivo VCA lo genera y entrega el backend de forma nativa (cron/fs).
      await labAPI.completeWarranty(warrantyToProcess.id);
      setAlert({ type: 'success', message: `Orden ${warrantyToProcess.orderNumber} impresa y procesada correctamente.` });

      // Recargar datos
      await loadWarranties(pagination.page);
      setQzConnected(isQZActive());
    } catch (err) {
      console.error(err);
      setAlert({
        type: 'error',
        message: err.message || 'Error al procesar con QZ Tray. Verifica que QZ Tray esté abierto.'
      });
    } finally {
      setProcessingId(null);
      setWarrantyToProcess(null);
    }
  };

  const handleTestPrint = async () => {
    setTestPrintResult(null);
    try {
      await connectQZ();
      const response = await labAPI.testTicket();
      const { ticketBase64, printerName } = response.data;
      await printRawData(printerName, ticketBase64);
      setTestPrintResult('success');
      setQzConnected(true);
    } catch (e) {
      console.error(e);
      setTestPrintResult('error');
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-opticolor-gray-900 mb-2">Panel de Laboratorio</h1>
          <p className="text-opticolor-gray-600">Estado del sistema y gestión de garantías</p>
        </div>

        {alert && (
          <div className="mb-6">
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          </div>
        )}

        {/* Sección 1: Estado del Sistema */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className={`border-l-4 ${qzConnected ? 'border-l-green-500' : 'border-l-red-500'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-opticolor-gray-500">QZ Tray</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${qzConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {qzConnected ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
            </div>
            <p className="text-xs text-opticolor-gray-400">{qzConnected ? 'Listo para imprimir' : 'QZ Tray no detectado en este equipo'}</p>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <p className="text-sm text-opticolor-gray-500 mb-2">Impresora: {printConfig.printerName || 'Bixolon'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleTestPrint} className="px-3 py-1 text-xs">Probar Impresión</Button>
              {testPrintResult === 'success' && (
                <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Ok
                </span>
              )}
              {testPrintResult === 'error' && (
                <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> Falló
                </span>
              )}
            </div>
          </Card>
        </div>

        {/* Sección 2: Garantías */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-opticolor-gray-900">Garantías del Laboratorio</h3>
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

          {/* Toolbar: búsqueda, filtros, filas por página y actualizar */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 inset-y-0 my-auto h-4 w-4 text-opticolor-gray-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Buscar por OTG…"
                aria-label="Buscar por OTG"
                className="pl-9 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                options={[{ value: '', label: 'Todas las tiendas' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
                aria-label="Tienda"
                className="py-2 text-sm"
              />
              {/* ✅ NUEVO: filtro por categoría del defecto */}
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={[{ value: '', label: 'Todas las categorías' }, ...categories.map((c) => ({ value: c.key, label: c.label }))]}
                aria-label="Categoría"
                className="py-2 text-sm"
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={STATUS_OPTIONS}
                aria-label="Estado"
                className="py-2 text-sm"
              />
              <Select
                value={pagination.limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                options={LIMIT_OPTIONS}
                aria-label="Filas por página"
                className="py-2 text-sm"
              />
              <Button variant="secondary" onClick={() => loadWarranties(pagination.page)} disabled={loading} className="px-3 py-2 text-sm">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Actualizar
              </Button>
            </div>
          </div>

          {/* Tabla */}
          {loading ? (
            <Spinner size="lg" className="py-12" />
          ) : warranties.length === 0 ? (
            <EmptyState
              title="No hay garantías"
              description="No se encontraron garantías con los filtros actuales"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl-min table-fixed">
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '21%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th># OTG</th>
                      <th>Tienda</th>
                      <th>Cliente</th>
                      <th>Categoría</th>
                      <th>Tipo</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warranties.map((w) => (
                      <tr key={w.id}>
                        <td className="overflow-hidden whitespace-nowrap text-ellipsis">
                          <OrderNumber code={w.orderNumber} />
                        </td>
                        <td className="text-sm font-medium text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis">
                          {w.store?.name || '-'}
                        </td>
                        <td className="text-sm text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis" title={w.orderData?.cliente_nombre || ''}>
                          {w.orderData?.cliente_nombre || '-'}
                        </td>
                        <td className="text-xs font-medium text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis" title={warrantyCategoryLabel(w.category)}>
                          {warrantyCategoryLabel(w.category)}
                        </td>
                        <td className="text-sm text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis" title={w.warrantyType || ''}>
                          {w.warrantyType || '-'}
                        </td>
                        <td className="text-sm text-opticolor-gray-500 whitespace-nowrap tabular-nums">
                          {formatDate(w.createdAt)}
                        </td>
                        <td>
                          {/* ✅ NUEVO: garantías "nueva OT pagada" no requieren acción del lab */}
                          {w.requiresVca === false ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-opticolor-gray-100 px-2.5 py-1 text-xs font-semibold text-opticolor-gray-600">
                              <span className="h-2 w-2 rounded-full bg-opticolor-gray-400" aria-hidden="true" />
                              Nueva OT (sin acción)
                            </span>
                          ) : (
                            <StatusBadge status={w.status} />
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedWarranty(w); setDetailModalOpen(true); }}>
                              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                              Detalle
                            </Button>
                            {/* ✅ NUEVO: sin Procesar/Ticket para "nueva OT pagada" */}
                            {w.requiresVca !== false && (
                              <>
                                {w.status === 'COMPLETED' && (
                                  <Button variant="secondary" size="sm" onClick={() => handleReprintClick(w)}>
                                    <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Ticket
                                  </Button>
                                )}
                                {(w.status === 'PENDING' || w.status === 'ERROR') && (
                                  <Button variant="primary" size="sm" onClick={() => handleProcess(w.id, w.orderNumber)} loading={processingId === w.id}>
                                    Procesar
                                  </Button>
                                )}
                                {w.status === 'PROCESSING' && (
                                  <Button variant="secondary" size="sm" disabled>
                                    Procesando...
                                  </Button>
                                )}
                              </>
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
                  Mostrando <span className="font-semibold">{((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)}</span> de <span className="font-semibold">{pagination.total}</span> garantías
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

        {/* Modal de Confirmación de Reimpresión */}
        <Modal
          isOpen={reprintModalOpen}
          onClose={() => {
            setReprintModalOpen(false);
            setWarrantyToReprint(null);
          }}
          title="Confirmar Reimpresión"
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ¿Estás seguro de reimprimir el ticket de la orden{' '}
                <span className="font-mono font-semibold">
                  #{warrantyToReprint?.orderNumber}
                </span>
                ?
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-opticolor-gray-200">
              <Button
                variant="secondary"
                onClick={() => {
                  setReprintModalOpen(false);
                  setWarrantyToReprint(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleReprintConfirm}
              >
                <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
                Reimprimir Ticket
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal de Confirmación de Procesamiento */}
        <Modal
          isOpen={processModalOpen}
          onClose={() => {
            setProcessModalOpen(false);
            setWarrantyToProcess(null);
          }}
          title="Confirmar Procesamiento"
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                ¿Procesar la orden{' '}
                <span className="font-mono font-semibold">
                  #{warrantyToProcess?.orderNumber}
                </span>
                ?
              </p>
              <p className="text-xs text-blue-700 mt-2">
                Se imprimirá el ticket. El archivo VCA lo entregará el agente local automáticamente.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-opticolor-gray-200">
              <Button
                variant="secondary"
                onClick={() => {
                  setProcessModalOpen(false);
                  setWarrantyToProcess(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleProcessConfirm}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Procesar Orden
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default LabDashboard;