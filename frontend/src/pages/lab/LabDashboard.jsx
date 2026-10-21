// frontend/src/pages/lab/LabDashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { labAPI, warrantyCategoryAPI } from '../../services/api';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import IconButton from '../../components/ui/IconButton';
import WarrantyDetailModal from '../../components/ui/WarrantyDetailModal';
import { Printer, CheckCircle2, Search, RefreshCw, Eye, Wifi, WifiOff, Play, Loader2 } from 'lucide-react';
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

// Badge de conexión QZ Tray (presentacional).
const ConnectionBadge = ({ connected }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${
      connected
        ? 'border-green-200 bg-green-50 text-green-700'
        : 'border-red-200 bg-red-50 text-opticolor-red-dark'
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
      aria-hidden="true"
    />
    {connected ? 'CONECTADO' : 'DESCONECTADO'}
  </span>
);

// Badge del resultado de la prueba de impresión (presentacional).
const PrintTestBadge = ({ result }) => {
  const styles = {
    success: 'border-green-200 bg-green-50 text-green-700',
    error: 'border-red-200 bg-red-50 text-opticolor-red-dark',
  };
  const labels = { success: 'OK', error: 'Falló' };
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${
        styles[result] || 'border-opticolor-gray-200 bg-opticolor-gray-50 text-opticolor-gray-500'
      }`}
    >
      {labels[result] || 'Sin probar'}
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

  // ============================================================
  // ✅ DERIVADOS DE PRESENTACIÓN (no alteran lógica de negocio)
  // ============================================================
  const renderStatus = (w) =>
    w.requiresVca === false && w.warrantyCase === 'NEW_ORDER' ? (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-opticolor-gray-200 bg-opticolor-gray-50 px-2.5 py-1 text-xs font-semibold text-opticolor-gray-600"
        title="Nueva OT pagada: no requiere acción del laboratorio"
      >
        <span className="h-2 w-2 rounded-full bg-opticolor-gray-400" aria-hidden="true" />
        Nueva OT
      </span>
    ) : (
      // ✅ NUEVO: garantías de LABORATORIO nacen COMPLETED -> badge Completado normal;
      // el tooltip del detalle ya explica que fue registrada sin VCA ni ticket.
      <StatusBadge status={w.status} />
    );

  const renderActions = (w) => (
    <div className="flex items-center justify-center gap-2">
      <IconButton
        icon={Eye}
        label="Ver detalle"
        onClick={() => {
          setSelectedWarranty(w);
          setDetailModalOpen(true);
        }}
      />
      {/* ✅ NUEVO: sin Procesar/Ticket para "nueva OT pagada" ni para LABORATORIO
          (no generan VCA ni ticket térmico; LAB nace COMPLETED) */}
      {w.requiresVca === false && w.requiresTicket === false ? (
        null
      ) : (
        <>
          {w.status === 'COMPLETED' && (
            <IconButton
              icon={Printer}
              label="Reimprimir ticket"
              variant="info"
              onClick={() => handleReprintClick(w)}
            />
          )}
          {(w.status === 'PENDING' || w.status === 'ERROR') && (
            <IconButton
              icon={Play}
              label="Procesar orden"
              variant="primary"
              onClick={() => handleProcess(w.id, w.orderNumber)}
              loading={processingId === w.id}
            />
          )}
          {w.status === 'PROCESSING' && (
            <IconButton icon={Loader2} label="Procesando" variant="info" loading disabled />
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-opticolor-gray-900">Panel de Laboratorio</h1>
        <p className="mt-1 text-sm text-opticolor-gray-500">Estado del sistema y gestión de garantías</p>
      </div>

      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {/* Sección 1: Estado del Sistema */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-opticolor-gray-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  qzConnected ? 'bg-green-50 text-green-600' : 'bg-red-50 text-opticolor-red'
                }`}
              >
                {qzConnected ? (
                  <Wifi className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                  Impresión
                </p>
                <h2 className="truncate text-base font-semibold text-opticolor-gray-900">QZ Tray</h2>
              </div>
            </div>
            <ConnectionBadge connected={qzConnected} />
          </div>
          <p className="mt-4 text-sm text-opticolor-gray-500">
            {qzConnected ? 'Listo para imprimir.' : 'QZ Tray no detectado en este equipo.'}
          </p>
          <p className="mt-auto pt-4 text-xs text-opticolor-gray-400">
            {qzConnected ? 'Conexión local activa' : 'Abrí QZ Tray para habilitar la impresión'}
          </p>
        </section>

        <section className="flex flex-col rounded-2xl border border-opticolor-gray-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Printer className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                  Ticketera
                </p>
                <h2 className="truncate text-base font-semibold text-opticolor-gray-900">
                  {printConfig.printerName || 'Bixolon'}
                </h2>
              </div>
            </div>
            <PrintTestBadge result={testPrintResult} />
          </div>
          <p className="mt-4 text-sm text-opticolor-gray-500">
            Impresión ESC/POS de los tickets del laboratorio.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <Button variant="secondary" size="sm" onClick={handleTestPrint} className="h-10 px-4">
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              Probar Impresión
            </Button>
          </div>
        </section>
      </div>

      {/* Sección 2: Garantías */}
      <section className="overflow-hidden rounded-2xl border border-opticolor-gray-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-opticolor-gray-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-opticolor-gray-900 sm:text-lg">
              Garantías del Laboratorio
            </h2>
            <p className="mt-0.5 text-sm text-opticolor-gray-500">
              Cola de trabajo y seguimiento de impresión
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="lab-refresh" className="text-xs font-medium text-opticolor-gray-500">
              Auto-refresh
            </label>
            <div className="w-28">
              <Select
                id="lab-refresh"
                size="sm"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                options={REFRESH_OPTIONS}
              />
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">

          {/* Toolbar: búsqueda, filtros, filas por página y actualizar */}
          <div className="mb-5 grid grid-cols-1 items-center gap-3 sm:grid-cols-2 xl:grid-cols-12">
            <div className="relative min-w-0 sm:col-span-2 xl:col-span-6 xl:col-start-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-opticolor-gray-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Buscar por OTG…"
                aria-label="Buscar por OTG"
                className="pl-9"
              />
            </div>

            <div className="min-w-0 xl:col-span-3 xl:col-start-1 xl:row-start-2">
              <Select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                options={[{ value: '', label: 'Todas las tiendas' }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
                aria-label="Tienda"
              />
            </div>

            {/* ✅ NUEVO: filtro por categoría del defecto */}
            <div className="min-w-0 xl:col-span-3 xl:col-start-4 xl:row-start-2">
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={[{ value: '', label: 'Todas las categorías' }, ...categories.map((c) => ({ value: c.key, label: c.label }))]}
                aria-label="Categoría"
              />
            </div>

            <div className="min-w-0 xl:col-span-3 xl:col-start-7 xl:row-start-2">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={STATUS_OPTIONS}
                aria-label="Estado"
              />
            </div>

            <div className="min-w-0 xl:col-span-3 xl:col-start-10 xl:row-start-2">
              <Select
                value={pagination.limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                options={LIMIT_OPTIONS}
                aria-label="Filas por página"
              />
            </div>

            <div className="sm:col-span-2 xl:col-span-6 xl:col-start-7 xl:row-start-1 xl:justify-self-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadWarranties(pagination.page)}
                disabled={loading}
                className="h-11 w-full px-4 xl:w-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Actualizar
              </Button>
            </div>
          </div>

          {/* Tabla (desktop) / tarjetas (tablet y móvil) */}
          {loading ? (
            <Spinner size="lg" className="py-12" />
          ) : warranties.length === 0 ? (
            <EmptyState
              title="No hay garantías"
              description="No se encontraron garantías con los filtros actuales"
            />
          ) : (
            <>
              {/* Tabla */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th className="w-[16%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:w-[12%]">
                        # OTG
                      </th>
                      <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:table-cell 2xl:w-[12%]">
                        Tienda
                      </th>
                      <th className="w-[36%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:w-[17%]">
                        Cliente
                      </th>
                      <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:table-cell 2xl:w-[11%]">
                        Categoría
                      </th>
                      <th className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:table-cell 2xl:w-[14%]">
                        Tipo
                      </th>
                      <th className="w-[17%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:w-[12%]">
                        Fecha
                      </th>
                      <th className="w-[18%] px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:w-[12%]">
                        Estado
                      </th>
                      <th className="w-[13%] whitespace-nowrap px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400 2xl:w-[10%]">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-opticolor-gray-100">
                    {warranties.map((w) => (
                      <tr key={w.id} className="transition-colors hover:bg-opticolor-gray-50/70">
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <OrderNumber code={w.orderNumber} />
                        </td>
                        <td className="hidden px-4 py-3.5 text-sm font-medium text-opticolor-gray-700 2xl:table-cell">
                          <span className="block max-w-[140px] truncate" title={w.store?.name || ''}>
                            {w.store?.name || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-opticolor-gray-600">
                          <span
                            className="block max-w-[180px] truncate"
                            title={w.orderData?.cliente_nombre || ''}
                          >
                            {w.orderData?.cliente_nombre || '-'}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3.5 text-xs font-medium text-opticolor-gray-600 2xl:table-cell">
                          <span
                            className="block max-w-[140px] truncate"
                            title={warrantyCategoryLabel(w.category)}
                          >
                            {warrantyCategoryLabel(w.category)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3.5 text-sm text-opticolor-gray-600 2xl:table-cell">
                          <span className="block max-w-[180px] truncate" title={w.warrantyType || ''}>
                            {w.warrantyType || '-'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm tabular-nums text-opticolor-gray-500">
                          {formatDate(w.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-center">{renderStatus(w)}</td>
                        <td className="px-4 py-3.5 text-center">{renderActions(w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas por fila */}
              <div className="space-y-3 xl:hidden">
                {warranties.map((w) => (
                  <article
                    key={w.id}
                    className="rounded-xl border border-opticolor-gray-200 bg-white p-4 shadow-soft"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <OrderNumber code={w.orderNumber} />
                      {renderStatus(w)}
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                          Cliente
                        </dt>
                        <dd
                          className="truncate text-sm font-medium text-opticolor-gray-800"
                          title={w.orderData?.cliente_nombre || ''}
                        >
                          {w.orderData?.cliente_nombre || '-'}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                          Tienda
                        </dt>
                        <dd className="truncate text-sm text-opticolor-gray-700">{w.store?.name || '-'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                          Categoría
                        </dt>
                        <dd
                          className="truncate text-sm text-opticolor-gray-700"
                          title={warrantyCategoryLabel(w.category)}
                        >
                          {warrantyCategoryLabel(w.category)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                          Tipo
                        </dt>
                        <dd className="truncate text-sm text-opticolor-gray-700" title={w.warrantyType || ''}>
                          {w.warrantyType || '-'}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-opticolor-gray-400">
                          Fecha
                        </dt>
                        <dd className="text-sm tabular-nums text-opticolor-gray-500">
                          {formatDate(w.createdAt)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex items-center justify-end border-t border-opticolor-gray-100 pt-3">
                      {renderActions(w)}
                    </div>
                  </article>
                ))}
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
        </div>
      </section>

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
  );
};

export default LabDashboard;