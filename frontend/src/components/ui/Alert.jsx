import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const Alert = ({ type = 'info', message, onClose }) => {
  const types = {
    success: 'bg-green-50 border-green-500 text-green-800',
    error: 'bg-red-50 border-opticolor-red-light text-opticolor-red-dark',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-800',
    info: 'bg-blue-50 border-blue-500 text-blue-800',
  };

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const Icon = icons[type];

  return (
    <div
      role="alert"
      className={`
        border-l-4 p-4 rounded-r-lg flex items-start gap-3
        animate-slide-up
        ${types[type]}
      `}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-sm">{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar notificación"
          className="text-current opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default Alert;
