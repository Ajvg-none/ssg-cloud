// frontend/src/components/ui/PageHeader.jsx
// Encabezado de página reutilizable: título, descripción y acciones.
// 100% presentacional.
import React from 'react';

const PageHeader = ({ title, description, actions, className = '' }) => (
  <div className={`mb-6 flex flex-wrap items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-opticolor-gray-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-opticolor-gray-500">{description}</p>}
    </div>
    {actions && (
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
    )}
  </div>
);

export default PageHeader;
