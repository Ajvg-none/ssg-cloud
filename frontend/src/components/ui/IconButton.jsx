// frontend/src/components/ui/IconButton.jsx
// Botón de acción compacto para columnas de tablas: icono + tooltip.
// Presentacional: recibe el handler ya existente, no contiene lógica.
import React from 'react';

const VARIANTS = {
  neutral: 'text-opticolor-gray-500 hover:bg-opticolor-gray-100 hover:text-opticolor-gray-900',
  primary: 'bg-opticolor-red text-white shadow-sm hover:bg-opticolor-red-dark',
  info: 'text-blue-600 hover:bg-blue-50',
  warning: 'text-amber-600 hover:bg-amber-50',
  danger: 'text-opticolor-red hover:bg-red-50',
  success: 'text-green-600 hover:bg-green-50',
};

const IconButton = ({
  icon: Icon,
  label,
  variant = 'neutral',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-opticolor-red focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      VARIANTS[variant] || VARIANTS.neutral
    } ${className}`}
    {...props}
  >
    {loading ? (
      <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    ) : (
      <Icon className="h-4 w-4" aria-hidden="true" />
    )}
  </button>
);

export default IconButton;
