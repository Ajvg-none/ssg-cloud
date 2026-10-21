// frontend/src/pages/admin/AdminUsers.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Pencil, KeyRound, Trash2, Search, RefreshCw } from 'lucide-react';
import { LIMIT_OPTIONS } from '../../utils/format';

const ROLE_LABELS = { ADMIN: 'Administrador', TIENDA: 'Tienda', LABORATORIO: 'Laboratorio' };
const ROLE_COLORS = {
  ADMIN: 'border-purple-200 bg-purple-50 text-purple-700',
  TIENDA: 'border-blue-200 bg-blue-50 text-blue-700',
  LABORATORIO: 'border-teal-200 bg-teal-50 text-teal-700',
};

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  // ✅ Búsqueda + paginación server-side
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'TIENDA', storeId: '', labId: '' });
  const [formErrors, setFormErrors] = useState({});
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState(null);
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [stores, setStores] = useState([]);
  const [labs, setLabs] = useState([]);

  const loadMeta = async () => {
    try {
      const [storesRes, labsRes] = await Promise.all([
        adminAPI.getStores(),
        adminAPI.getLabs(),
      ]);
      setStores(storesRes.data.stores || []);
      setLabs(labsRes.data.labs || []);
    } catch (e) { /* silencioso */ }
  };

  // ✅ Carga server-side con búsqueda + paginación
  const loadUsers = useCallback(async (page = 1, limitOverride) => {
    setLoading(true);
    try {
      const res = await adminAPI.getUsers({
        search: search.trim() || undefined,
        page,
        limit: limitOverride ?? limit,
      });
      setUsers(res.data.users || []);
      setPagination(res.data.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al cargar usuarios' });
    } finally {
      setLoading(false);
    }
  }, [search, limit]);

  // Carga inicial
  useEffect(() => {
    loadMeta();
    loadUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Debounce de búsqueda (400ms) → vuelve a la página 1
  const isFirstSearchRun = useRef(true);
  useEffect(() => {
    if (isFirstSearchRun.current) {
      isFirstSearchRun.current = false;
      return;
    }
    const timer = setTimeout(() => loadUsers(1), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    loadUsers(1, newLimit);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm({ username: '', password: '', role: 'TIENDA', storeId: '', labId: '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({ username: user.username, password: '', role: user.role, storeId: user.storeId || '', labId: user.labId || '' });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!form.username.trim()) errors.username = 'El usuario es obligatorio';
    if (!editingUser && (!form.password || form.password.length < 6)) errors.password = 'Mínimo 6 caracteres';
    if (form.role === 'TIENDA' && !form.storeId) errors.storeId = 'Asigna una tienda';
    if (form.role === 'LABORATORIO' && !form.labId) errors.labId = 'Asigna un laboratorio';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editingUser) {
        await adminAPI.updateUser(editingUser.id, { username: form.username, active: editingUser.active });
        if (form.password) {
          await adminAPI.resetUserPassword(editingUser.id, form.password);
        }
        setAlert({ type: 'success', message: 'Usuario actualizado' });
      } else {
        await adminAPI.createUser(form);
        setAlert({ type: 'success', message: 'Usuario creado exitosamente' });
      }
      setModalOpen(false);
      loadUsers(pagination.page); // conserva la página actual
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const openResetPassword = (user) => {
    setResetUserId(user.id);
    setResetUsername(user.username);
    setNewPassword('');
    setResetModalOpen(true);
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setAlert({ type: 'warning', message: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setResetting(true);
    try {
      await adminAPI.resetUserPassword(resetUserId, newPassword);
      setAlert({ type: 'success', message: `Contraseña reseteada para "${resetUsername}"` });
      setResetModalOpen(false);
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al resetear' });
    } finally {
      setResetting(false);
    }
  };

  const openDeleteModal = (user) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setUserToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await adminAPI.deleteUser(userToDelete.id);
      setAlert({ type: 'success', message: `Usuario "${userToDelete.username}" eliminado exitosamente.` });
      closeDeleteModal();
      loadUsers(pagination.page); // conserva la página actual
    } catch (e) {
      setAlert({ type: 'error', message: e.response?.data?.error || 'Error al eliminar el usuario' });
    } finally {
      setDeleting(false);
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Usuarios"
        description="Gestiona las cuentas de acceso al sistema"
        actions={<Button onClick={openCreate} className="w-full sm:w-auto">+ Nuevo Usuario</Button>}
      />

      {alert && (
        <div className="mb-6 animate-slide-up">
          <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
        </div>
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre de usuario…"
              aria-label="Buscar usuario"
              className="pl-9"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="w-32">
              <Select
                value={limit}
                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                options={LIMIT_OPTIONS}
                aria-label="Filas por página"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadUsers(pagination.page)}
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
          ) : users.length === 0 ? (
            search.trim() ? (
              <EmptyState
                title="Sin resultados"
                description={`No se encontraron usuarios para "${search}"`}
              />
            ) : (
              <EmptyState
                title="No hay usuarios"
                description="Crea el primer usuario para comenzar"
                action={<Button onClick={openCreate}>+ Crear Usuario</Button>}
              />
            )
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl-min table-fixed min-w-[900px]">
                  <colgroup>
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '24%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-opticolor-gray-200">
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Asociado a</th>
                      <th className="is-center">Estado</th>
                      <th className="is-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="text-sm font-medium text-opticolor-gray-800 overflow-hidden whitespace-nowrap text-ellipsis">{user.username}</td>
                        <td>
                          <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_COLORS[user.role] || 'border-opticolor-gray-200 bg-opticolor-gray-50 text-opticolor-gray-600'}`}>
                            {ROLE_LABELS[user.role] || user.role}
                          </span>
                        </td>
                        <td className="text-sm text-opticolor-gray-700 overflow-hidden whitespace-nowrap text-ellipsis" title={user.store ? `${user.store.name} (${user.store.accn})` : user.lab ? user.lab.name : ''}>
                          {user.store ? `${user.store.name} (${user.store.accn})` : user.lab ? user.lab.name : '-'}
                        </td>
                        <td className="is-center">
                          <span className={`badge-pill ${user.active ? 'badge-pill-active' : 'badge-pill-inactive'}`}>
                            {user.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="is-center">
                          <div className="flex items-center justify-center gap-2">
                            <IconButton
                              icon={Pencil}
                              label="Editar usuario"
                              onClick={() => openEdit(user)}
                            />
                            <IconButton
                              icon={KeyRound}
                              label="Resetear contraseña"
                              onClick={() => openResetPassword(user)}
                            />
                            {user.role !== 'ADMIN' && (
                              <IconButton
                                icon={Trash2}
                                label="Eliminar usuario"
                                variant="danger"
                                onClick={() => openDeleteModal(user)}
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
                  de <span className="font-semibold text-opticolor-gray-700">{pagination.total}</span> usuarios
                </p>
                <div className="max-w-full overflow-x-auto">
                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    onChange={(p) => loadUsers(p)}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Modal Crear/Editar Usuario */}
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'} size="md">
          <div className="space-y-4">
            <Input label="Nombre de Usuario" value={form.username} onChange={(e) => handleChange('username', e.target.value)} error={formErrors.username} placeholder="Ej: tienda001" disabled={!!editingUser} />
            <Input label={editingUser ? 'Nueva Contraseña (dejar vacío para no cambiar)' : 'Contraseña'} type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} error={formErrors.password} placeholder="Mínimo 6 caracteres" />
            <Select
              label="Rol"
              value={form.role}
              onChange={(e) => handleChange('role', e.target.value)}
              disabled={!!editingUser}
              options={[
                { value: 'TIENDA', label: 'Tienda' },
                { value: 'LABORATORIO', label: 'Laboratorio' },
              ]}
            />
            {form.role === 'TIENDA' && (
              <Select
                label="Tienda Asociada"
                value={form.storeId}
                onChange={(e) => handleChange('storeId', e.target.value)}
                error={formErrors.storeId}
                placeholder="Seleccionar..."
                options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.accn})` }))}
              />
            )}
            {form.role === 'LABORATORIO' && (
              <Select
                label="Laboratorio Asociado"
                value={form.labId}
                onChange={(e) => handleChange('labId', e.target.value)}
                error={formErrors.labId}
                placeholder="Seleccionar..."
                options={labs.map((l) => ({ value: l.id, label: l.name }))}
              />
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-opticolor-gray-200">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>{editingUser ? 'Guardar Cambios' : 'Crear Usuario'}</Button>
            </div>
          </div>
        </Modal>

        {/* Modal Reset Password */}
        <Modal isOpen={resetModalOpen} onClose={() => setResetModalOpen(false)} title={`Resetear Contraseña — ${resetUsername}`} size="sm">
          <div className="space-y-4">
            <Input label="Nueva Contraseña" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setResetModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleResetPassword} loading={resetting}>Resetear</Button>
            </div>
          </div>
        </Modal>

        {/* Modal de Confirmación de Eliminación */}
        <Modal isOpen={deleteModalOpen} onClose={closeDeleteModal} title="Eliminar Usuario" size="sm">
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5 bg-red-100 rounded-full p-2">
                <Trash2 className="h-5 w-5 text-red-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800 mb-1">
                  ¿Eliminar al usuario <span className="font-mono">"{userToDelete?.username}"</span>?
                </p>
                <p className="text-sm text-red-700">
                  Esta acción eliminará la cuenta permanentemente de la base de datos y no se puede deshacer.
                </p>
                {userToDelete?.store && (
                  <p className="text-xs text-red-600 mt-2">
                    Tienda asociada: {userToDelete.store.name} ({userToDelete.store.accn})
                  </p>
                )}
                {userToDelete?.lab && (
                  <p className="text-xs text-red-600 mt-2">
                    Laboratorio asociado: {userToDelete.lab.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={closeDeleteModal} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm} loading={deleting}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Eliminar definitivamente
              </Button>
            </div>
          </div>
        </Modal>
    </div>
  );
};

export default AdminUsers;