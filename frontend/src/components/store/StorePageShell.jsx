// frontend/src/components/store/StorePageShell.jsx
// Contenedor común de las vistas de tienda: header compacto sticky + contenido.
import React from 'react';
import StoreHeader from '../layout/StoreHeader';

const StorePageShell = ({ children, className = '' }) => (
  <div className="min-h-screen bg-opticolor-gray-50">
    <StoreHeader />
    <main className={`mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </main>
  </div>
);

export default StorePageShell;
