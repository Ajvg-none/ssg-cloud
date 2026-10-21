// frontend/src/components/layout/StoreHeader.jsx
// Barra de app compacta y sticky: marca · navegación segmented · usuario.
// Sustituye al hero grande; elimina también el acento indigo (fuera de paleta).
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
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
  const subtitle = store?.accn ? `ACCN ${store.accn}` : null;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('storeId');
    localStorage.removeItem('labId');
    navigate('/login');
  };

  // Pestañas de navegación
  const isActiveNew = location.pathname === '/store';
  const isActiveHistory = location.pathname.startsWith('/store/history');

  const tabs = [
    { to: '/store', label: 'Nueva Garantía', icon: FilePlus2, active: isActiveNew },
    { to: '/store/history', label: 'Historial', icon: History, active: isActiveHistory },
  ];

  const renderTabs = (fullWidth = false) => (
    <nav
      aria-label="Navegación de tienda"
      className={`inline-flex items-center gap-1 rounded-xl bg-opticolor-gray-100 p-1 ${fullWidth ? 'flex w-full' : ''}`}
    >
      {tabs.map(({ to, label, icon: Icon, active }) => (
        <Link
          key={to}
          to={to}
          aria-current={active ? 'page' : undefined}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
            fullWidth ? 'flex-1' : ''
          } ${active ? 'bg-white text-opticolor-red shadow-sm' : 'text-opticolor-gray-600 hover:text-opticolor-gray-900'}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-opticolor-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Marca */}
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-opti.jpg" alt="Opti-Color" className="h-9 w-auto object-contain" />
            <span aria-hidden="true" className="hidden h-6 w-px bg-opticolor-gray-200 sm:block" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold leading-tight text-opticolor-gray-900">{displayName}</p>
              {subtitle && <p className="truncate text-xs leading-tight text-opticolor-gray-500">{subtitle}</p>}
            </div>
          </div>

          {/* Navegación (desktop) */}
          <div className="hidden md:block">{renderTabs()}</div>

          {/* Usuario */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-opticolor-gray-200 bg-white py-1 pl-1 pr-1.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-opticolor-red text-xs font-bold text-white"
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-[130px] truncate text-sm font-semibold text-opticolor-gray-800 lg:block">
                {displayName}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-full text-opticolor-gray-500 transition-colors hover:bg-opticolor-gray-100 hover:text-opticolor-red"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navegación (móvil) */}
        <div className="pb-3 md:hidden">{renderTabs(true)}</div>
      </div>
    </header>
  );
};

export default StoreHeader;
