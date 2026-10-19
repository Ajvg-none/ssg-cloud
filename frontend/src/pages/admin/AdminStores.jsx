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
import { Pencil, Pause, Play, Search, RefreshCw } from 'lucide-react';
import { LIMIT_OPTIONS } from '../../utils/format';

const AdminStores = () => {
  const [stores, setStores] = useState([]);
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', accn: '', labId: '' });
  const [formErrors, setFormErrors] = useState({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [storesRes, labsRes] = await Promise.all([
        adminAPI.getStores(),
        adminAPI.getLabs(),
      ]);
      setStores(storesRes.data.stores || []);
      setLabs(labsRes.data.labs || []);
    } catch (e) {
      setAlert({ type: 'error', message: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingStore(null);
    setForm({ name: '', accn: '', labId: labs[0]?.id || '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (store) => {
    setEditingStore(store);
    setForm({
      name: store.name,
      accn: store.accn,
      labId: store.labId || store.lab?.id || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'El nombre es obligatorio';
    if (!form.accn || !/^\d{3}$/.test(form.accn)) errors.accn = 'El ACCN debe ser 3 dígitos numéricos';
    if (!form.labId) errors.labId = 'Selecciona un laboratorio';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editingStore) {
        const data = { name: form.name, accn: form.accn, labId: form.labId };
        await adminAPI.updateStore(editingStore.id, data);
        setAlert({ type: 'success', message: 'Tienda actualizada' });
      } else {
        await adminAPI.createStore(form);
        setAlert({ type: 'success', message: 'Tienda creada exitosamente' });
      }
      setModalOpen(false);
      loadData();
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (store) => {
    try {
      await adminAPI.updateStore(store.id, { active: !store.active });
      setAlert({ type: 'success', message: `Tienda ${store.active ? 'desactivada' : 'activada'}` });
      loadData();
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error' });
    }
  };

  // Filtro y paginación en el navegador (el endpoint trae todas las tiendas)
  const filteredStores = (stores || []).filter((store) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (store.name || '').toLowerCase().includes(q) ||
      (store.accn || '').toLowerCase().includes(q) ||
      (store.lab?.name || '').toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredStores.length / limit));
  const safePage = Math.min(page, totalPages);
  const pagedStores = filteredStores.slice((safePage - 1) * limit, safePage * limit);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-opticolor-gray-900 mb-2">Tiendas</h1>
          <p className="text-opticolor-gray-600">Gestiona las tiendas y sus códigos ACCN</p>
        </div>
        <Button onClick={openCreate}>+ Nueva Tienda</Button>
      </div>

      {alert && (
        <div className="mb-6">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
      )}

      <Card>
        {/* Toolbar: búsqueda, filas por página y actualizar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 inset-y-0 my-auto h-4 w-4 text-opticolor-gray-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, ACCN o laboratorio…"
              aria-label="Buscar tienda"
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
            <Button variant="secondary" onClick={loadData} disabled={loading} className="px-3 py-2 text-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>
        {loading ? (
          <Spinner size="lg" className="py-12" />
        ) : stores.length === 0 ? (
          <EmptyState
            title="No hay tiendas"
            description="Crea la primera tienda para empezar"
            action={<Button onClick={openCreate}>+ Crear Tienda</Button>}
          />
        ) : filteredStores.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description={`No se encontraron tiendas para "${search}"`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl-min table-fixed">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-opticolor-gray-200">
                    <th>Nombre</th>
                    <th>ACCN</th>
                    <th>Laboratorio</th>
                    <th>Garantías</th>
                    <th>Usuarios</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStores.map((store) => (
                    <tr key={store.id}>
                      <td className="text-sm font-semibold text-opticolor-gray-800 overflow-hidden whitespace-nowrap text-ellipsis">{store.name}</td>
                      <td>
                        <span className="inline-flex rounded-md border border-opticolor-gray-200 bg-opticolor-gray-100 px-2 py-0.5 text-[11px] font-bold text-opticolor-gray-600 tabular-nums">
                          {store.accn}
                        </span>
                      </td>
                      <td className="text-sm text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis">{store.lab?.name || '-'}</td>
                      <td className="text-sm font-semibold text-opticolor-gray-700 tabular-nums">{store._count?.warranties || 0}</td>
                      <td className="text-sm font-semibold text-opticolor-gray-700 tabular-nums">{store._count?.users || 0}</td>
                      <td>
                        <span className={`badge-pill ${store.active ? 'badge-pill-active' : 'badge-pill-inactive'}`}>
                          {store.active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(store)}
                            className="btn-ghost btn-ghost-neutral"
                            title="Editar tienda"
                          >
                            <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => handleToggleActive(store)}
                            className={`btn-ghost ${store.active ? 'btn-ghost-danger' : 'btn-ghost-neutral'}`}
                            title={store.active ? 'Desactivar tienda' : 'Activar tienda'}
                          >
                            {store.active ? (
                              <Pause className="h-4 w-4 shrink-0" aria-hidden="true" />
                            ) : (
                              <Play className="h-4 w-4 shrink-0" aria-hidden="true" />
                            )}
                            <span>{store.active ? 'Desactivar' : 'Activar'}</span>
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
                Mostrando <span className="font-semibold">{(safePage - 1) * limit + 1}–{Math.min(safePage * limit, filteredStores.length)}</span> de <span className="font-semibold">{filteredStores.length}</span> tiendas
              </p>
              <Pagination page={safePage} totalPages={totalPages} onChange={(p) => setPage(p)} />
            </div>
          </>
        )}
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingStore ? 'Editar Tienda' : 'Nueva Tienda'} size="md">
        <div className="space-y-4">
          <Input 
            label="Nombre de la Tienda" 
            value={form.name} 
            onChange={(e) => handleChange('name', e.target.value)} 
            error={formErrors.name} 
            placeholder="Ej: Óptica Centro" 
          />
          <Input 
            label="Código ACCN (3 dígitos)" 
            value={form.accn} 
            onChange={(e) => handleChange('accn', e.target.value)} 
            error={formErrors.accn} 
            placeholder="Ej: 001" 
            maxLength={3} 
          />
          <Select
            label="Laboratorio Asignado"
            value={form.labId}
            onChange={(e) => handleChange('labId', e.target.value)}
            error={formErrors.labId}
            placeholder="Seleccionar..."
            options={labs.map((lab) => ({ value: lab.id, label: lab.name }))}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-opticolor-gray-200">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>
              {editingStore ? 'Guardar Cambios' : 'Crear Tienda'}
            </Button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
};

export default AdminStores;