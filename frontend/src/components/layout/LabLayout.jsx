// frontend/src/components/layout/LabLayout.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import UserChip from '../ui/UserChip';
import { LogoutIcon } from '../ui/Icons';
import { LayoutDashboard } from 'lucide-react';

const LabLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'Laboratorio';
  const [lab, setLab] = useState(null);

  useEffect(() => {
    const loadLab = async () => {
      try {
        const res = await authAPI.me();
        const l = res.data?.user?.lab;
        if (l) setLab(l);
      } catch {
        // Silencioso
      }
    };
    loadLab();
  }, []);


  const menuItems = [
    { path: '/lab', label: 'Panel', icon: LayoutDashboard, exact: true },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('storeId');
    localStorage.removeItem('labId');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-opticolor-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-opticolor-gray-200 shadow-sm flex flex-col">
        
        {/* --- HEADER DEL SIDEBAR (RE DISEÑADO) --- */}
        <div className="p-6 border-b border-opticolor-gray-200 flex flex-col items-center gap-4">
          {/* Logo */}
          <img
            src="/logo-opti.jpg"
            alt="Opti-Color"
            className="h-32 w-auto object-contain" 
          />
          
          {/* Tarjeta de Usuario Compacta */}
          <div className="w-full bg-opticolor-gray-50 rounded-xl p-3 border border-opticolor-gray-100 flex flex-col items-center text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-opticolor-gray-400 mb-2">
              Panel de Laboratorio
            </span>
            <UserChip name={lab?.name || username} subtitle={username} />
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-opticolor-red text-white shadow-md'
                        : 'text-opticolor-gray-700 hover:bg-opticolor-gray-100'
                    }`}
                  >
                    {(() => {
                      const Icon = item.icon;
                      return <Icon className="h-5 w-5" aria-hidden="true" />;
                    })()}
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer del Sidebar */}
        <div className="mt-auto p-4 border-t border-opticolor-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-opticolor-red hover:bg-red-50 transition-colors rounded-lg"
          >
            <LogoutIcon />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto">
        <div key={location.pathname} className="h-full animate-slide-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default LabLayout;