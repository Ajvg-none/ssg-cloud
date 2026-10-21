import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import IconButton from '../../components/ui/IconButton';
import PageHeader from '../../components/ui/PageHeader';
import { Pencil, Trash2, Search, RefreshCw } from 'lucide-react';
import { LIMIT_OPTIONS } from '../../utils/format';

const AdminLabs = () => {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', vcaNetworkPath: '', printerName: '', printEnabled: true, vcaEnabled: true });
  const [formErrors, setFormErrors] = useState({});
  const [generatedKey, setGeneratedKey] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => { loadLabs(); }, []);

  const loadLabs = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getLabs();
      setLabs(res.data.labs || []);
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al cargar laboratorios' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingLab(null);
    setForm({ name: '', vcaNetworkPath: '', printerName: '', printEnabled: true, vcaEnabled: true });
    setFormErrors({});
    setGeneratedKey(null);
    setModalOpen(true);
  };

  const openEdit = (lab) => {
    setEditingLab(lab);
    setForm({ name: lab.name, vcaNetworkPath: lab.vcaNetworkPath, printerName: lab.printerName || '', printEnabled: lab.printEnabled !== false, vcaEnabled: lab.vcaEnabled !== false });
    setFormErrors({});
    setGeneratedKey(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio';
    if (!form.vcaNetworkPath.trim()) errors.vcaNetworkPath = 'La ruta VCA es obligatoria';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editingLab) {
        await adminAPI.updateLab(editingLab.id, form);
        setAlert({ type: 'success', message: 'Laboratorio actualizado exitosamente' });
      } else {
        const res = await adminAPI.createLab(form);
        setGeneratedKey(res.data.lab?.apiKey || null);
        setAlert({ type: 'success', message: 'Laboratorio creado. Guarda la API Key.' });
      }
      setModalOpen(false);
      loadLabs();
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (lab) => {
    if (!window.confirm(`¿Eliminar "${lab.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await adminAPI.deleteLab(lab.id);
      setAlert({ type: 'success', message: 'Laboratorio eliminado' });
      loadLabs();
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al eliminar' });
    }
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key).then(() => {
      setAlert({ type: 'info', message: 'API Key copiada al portapapeles' });
    });
  };

  // Filtro y paginación en el navegador (el endpoint trae todos los labs)
  const filteredLabs = (labs || []).filter((lab) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (lab.name || '').toLowerCase().includes(q) ||
      (lab.agentIp || '').toLowerCase().includes(q) ||
      (lab.vcaNetworkPath || '').toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredLabs.length / limit));
  const safePage = Math.min(page, totalPages);
  const pagedLabs = filteredLabs.slice((safePage - 1) * limit, safePage * limit);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Laboratorios"
        description="Gestiona los laboratorios y sus configuraciones de agente"
        actions={<Button onClick={openCreate} className="w-full sm:w-auto">+ Nuevo Laboratorio</Button>}
      />

      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      {generatedKey && (
        <Card className="mb-6 border-2 border-green-300 bg-green-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800 mb-1">Clave API Generada</p>
              <p className="font-mono text-sm text-green-900 bg-green-100 px-3 py-1 rounded">{generatedKey}</p>
              <p className="text-xs text-green-700 mt-1">Guarda esta clave. No se mostrará de nuevo.</p>
            </div>
            <Button variant="secondary" onClick={() => handleCopyKey(generatedKey)} className="text-sm">Copiar</Button>
          </div>
        </Card>
      )}

      <Card>
        {/* Toolbar: búsqueda, filas por página y actualizar */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-opticolor-gray-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, IP o ruta…"
              aria-label="Buscar laboratorio"
              className="pl-9"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="w-32">
              <Select
                value={limit}
                onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
                options={LIMIT_OPTIONS}
                aria-label="Filas por página"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={loadLabs}
              disabled={loading}
              className="h-11 px-4"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>
        {loading ? (
          <Spinner size="lg" className="py-12" />
        ) : labs.length === 0 ? (
          <EmptyState
            title="No hay laboratorios"
            description="Crea el primer laboratorio para comenzar"
            action={<Button onClick={openCreate}>+ Crear Laboratorio</Button>}
          />
                ) : filteredLabs.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description={`No se encontraron laboratorios para "${search}"`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl-min table-fixed min-w-[900px]">
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-opticolor-gray-200">
                    <th>Nombre</th>
                    <th>Tickera</th>
                    <th>Ruta VCA</th>
                    <th className="is-center">Tiendas</th>
                    <th className="is-center">Garantías</th>
                    <th className="is-center">Impresión</th>
                    <th className="is-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLabs.map((lab) => (
                    <tr key={lab.id}>
                      <td className="text-sm font-semibold text-opticolor-gray-800 overflow-hidden whitespace-nowrap text-ellipsis">{lab.name}</td>
                      <td>
                        <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-opticolor-gray-200 bg-opticolor-gray-50 px-2.5 py-1 text-xs font-semibold text-opticolor-gray-600">
                          {lab.printerName || 'Bixolon'}
                        </span>
                      </td>
                      <td className="text-sm text-opticolor-gray-600 overflow-hidden whitespace-nowrap text-ellipsis" title={lab.vcaNetworkPath}>{lab.vcaNetworkPath}</td>
                      <td className="is-center text-sm font-semibold text-opticolor-gray-700 tabular-nums">{lab._count?.stores || 0}</td>
                      <td className="is-center text-sm font-semibold text-opticolor-gray-700 tabular-nums">{lab._count?.warranties || 0}</td>
                      <td className="is-center">
                        <span className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${lab.printEnabled !== false ? 'border-green-200 bg-green-50 text-green-700' : 'border-opticolor-gray-200 bg-opticolor-gray-50 text-opticolor-gray-500'}`}>
                          <span className={`h-2 w-2 rounded-full ${lab.printEnabled !== false ? 'bg-green-500' : 'bg-opticolor-gray-400'}`} aria-hidden="true" />
                          {lab.printEnabled !== false ? 'ON' : 'OFF'}
                        </span>
                      </td>
                      <td className="is-center">
                        <div className="flex items-center justify-center gap-2">
                          <IconButton
                            icon={Pencil}
                            label="Editar laboratorio"
                            onClick={() => openEdit(lab)}
                          />
                          <IconButton
                            icon={Trash2}
                            label="Eliminar laboratorio"
                            variant="danger"
                            onClick={() => handleDelete(lab)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col gap-3 border-t border-opticolor-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-opticolor-gray-500">
                Mostrando{' '}
                <span className="font-semibold text-opticolor-gray-700">
                  {(safePage - 1) * limit + 1}–{Math.min(safePage * limit, filteredLabs.length)}
                </span>{' '}
                de <span className="font-semibold text-opticolor-gray-700">{filteredLabs.length}</span> laboratorios
              </p>
              <div className="max-w-full overflow-x-auto">
                <Pagination page={safePage} totalPages={totalPages} onChange={(p) => setPage(p)} />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modal Crear/Editar */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingLab ? 'Editar Laboratorio' : 'Nuevo Laboratorio'} size="md">
        <div className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={(e) => handleChange('name', e.target.value)} error={formErrors.name} placeholder="Ej: Laboratorio Central" />
          <Input label="Ruta VCA de Red" value={form.vcaNetworkPath} onChange={(e) => handleChange('vcaNetworkPath', e.target.value)} error={formErrors.vcaNetworkPath} placeholder="Ej: \\192.168.1.100\Lensware\VCA" />

          {/* Configuración de Impresión */}
          <div className="pt-4 border-t border-opticolor-gray-200 space-y-4">
            <h4 className="text-sm font-semibold text-opticolor-gray-700">Configuración de Impresión</h4>
            <Input label="Nombre de la Impresora" value={form.printerName} onChange={(e) => handleChange('printerName', e.target.value)} placeholder="Ej: Bixolon" />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-opticolor-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.printEnabled}
                  onChange={(e) => handleChange('printEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-opticolor-gray-300 text-opticolor-red focus:ring-opticolor-red"
                />
                Impresión habilitada
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-opticolor-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.vcaEnabled}
                  onChange={(e) => handleChange('vcaEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-opticolor-gray-300 text-opticolor-red focus:ring-opticolor-red"
                />
                Generación de VCA habilitada
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-opticolor-gray-200">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editingLab ? 'Guardar Cambios' : 'Crear Laboratorio'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminLabs;
