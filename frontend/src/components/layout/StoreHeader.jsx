// frontend/src/components/layout/StoreHeader.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import UserChip from '../ui/UserChip';
import { LogoutIcon } from '../ui/Icons';
import { FilePlus2, History } from 'lucide-react';

const StoreHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [store, setStore] = useState(null);

  useEffect(() => {
    const loadStore = async () => {
      try {
        const res = await authAPI.me();
        const s = res.data?.user?.store;
        if (s) setStore(s);
      } catch {
        // Sin nombre de tienda: se usa el username como respaldo
      }
    };
    loadStore();
  }, []);

  const username = localStorage.getItem('username') || 'Tienda';
  const displayName = store?.name || username;
  const subtitle = store?.accn ? `ACCN ${store.accn}` : undefined;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('storeId');
    localStorage.removeItem('labId');
    navigate('/login');
  };

  // ✅ Pestañas de navegación
  const isActiveNew = location.pathname === '/store';
  const isActiveHistory = location.pathname.startsWith('/store/history');

  const tabBase = 'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200';
  const tabActive = 'bg-opticolor-red text-white shadow-md';
  const tabInactive = 'text-opticolor-gray-600 hover:bg-opticolor-gray-100';

  return (
    <header className="bg-white rounded-2xl shadow-sm border border-opticolor-gray-100 p-6 mb-8">
      {/* --- FILA SUPERIOR: LOGO + TÍTULO | USUARIO + SALIR --- */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Lado Izquierdo: Logo + Títulos */}
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            <img
              src="/logo-opti.jpg"
              alt="Opti-Color Logo"
              className="h-16 w-auto object-contain"
            />
          </div>

          <div className="hidden sm:block h-12 w-px bg-opticolor-gray-200"></div>

          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
              Sistema de Garantías
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-opticolor-gray-900">
              Panel de Tienda
            </h1>
            <p className="text-sm text-opticolor-gray-500 mt-1 hidden sm:block">
              Gestiona tus órdenes y garantías desde aquí.
            </p>
          </div>
        </div>

        {/* Lado Derecho: Usuario + Salir */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 bg-opticolor-gray-50 px-3 py-1.5 rounded-full border border-opticolor-gray-200">
            <UserChip name={displayName} subtitle={subtitle} />
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-opticolor-gray-200 bg-white text-sm font-medium text-opticolor-gray-600 hover:bg-opticolor-gray-50 hover:border-opticolor-gray-300 transition-all shadow-sm"
          >
            <LogoutIcon className="h-4 w-4" />
            <span>Salir</span>
          </button>
        </div>
      </div>

      {/* --- ✅ NUEVO: PESTAÑAS DE NAVEGACIÓN --- */}
      <nav className="mt-6 pt-4 border-t border-opticolor-gray-100 flex items-center gap-2">
        <Link
          to="/store"
          className={`${tabBase} ${isActiveNew ? tabActive : tabInactive}`}
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          Nueva Garantía
        </Link>
        <Link
          to="/store/history"
          className={`${tabBase} ${isActiveHistory ? tabActive : tabInactive}`}
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Historial
        </Link>
      </nav>
    </header>
  );
};

export default StoreHeader;