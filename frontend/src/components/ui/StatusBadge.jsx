import React from 'react';

const STATUS_STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  ERROR: 'bg-red-100 text-opticolor-red-dark',
};
const STATUS_DOTS = {
  PENDING: 'bg-yellow-500',
  PROCESSING: 'bg-blue-500 animate-pulse',
  COMPLETED: 'bg-green-500',
  ERROR: 'bg-red-500',
};const STATUS_LABELS = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completado',
  ERROR: 'Error',
};

const StatusBadge = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status] || 'bg-opticolor-gray-100 text-opticolor-gray-700';
  const dot = STATUS_DOTS[status] || 'bg-opticolor-gray-400';
  const label = STATUS_LABELS[status] || status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style} ${className}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export default StatusBadge;
