import React from 'react';

const STATUS_STYLES = {
  PENDING: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  PROCESSING: 'border-blue-200 bg-blue-50 text-blue-700',
  COMPLETED: 'border-green-200 bg-green-50 text-green-700',
  ERROR: 'border-red-200 bg-red-50 text-opticolor-red-dark',
};
const STATUS_DOTS = {
  PENDING: 'bg-yellow-500',
  PROCESSING: 'bg-blue-500 animate-pulse',
  COMPLETED: 'bg-green-500',
  ERROR: 'bg-red-500',
};
const STATUS_LABELS = {
  PENDING: 'Pendiente',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completado',
  ERROR: 'Error',
};

const StatusBadge = ({ status, className = '' }) => {
  const style = STATUS_STYLES[status] || 'border-opticolor-gray-200 bg-opticolor-gray-50 text-opticolor-gray-600';
  const dot = STATUS_DOTS[status] || 'bg-opticolor-gray-400';
  const label = STATUS_LABELS[status] || status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${style} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export default StatusBadge;
