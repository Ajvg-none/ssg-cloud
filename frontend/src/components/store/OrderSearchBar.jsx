// frontend/src/components/store/OrderSearchBar.jsx
// Buscador de OTG. Variante expandida (sin orden) y compacta (orden cargada).
// Presentacional: valor, cambio y búsqueda vienen de la página (store Zustand).
// No pinta card propia: la sección que lo contiene (`FormSection`) ya aporta
// el borde, la sombra y el padding.
import React from 'react';
import { Search } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';

const OrderSearchBar = ({
  value,
  onChange,
  onSearch,
  loading = false,
  disabled = false,
  compact = false,
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading && !disabled) onSearch();
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-opticolor-gray-400"
            aria-hidden="true"
          />
          <input
            value={value}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || loading}
            aria-label="Número de OTG"
            placeholder="Buscar otra OTG…"
            className="h-11 w-full rounded-lg border-2 border-opticolor-gray-200 py-0 pl-9 pr-3 text-sm transition-all duration-200 hover:border-opticolor-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-opticolor-red disabled:cursor-not-allowed disabled:bg-opticolor-gray-50"
          />
        </div>
        <Button
          onClick={onSearch}
          loading={loading}
          disabled={disabled}
          variant="secondary"
          size="sm"
          className="h-11 shrink-0 px-5"
        >
          Buscar
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label="Número de OTG"
            placeholder="Ej: 12345"
            value={value}
            onChange={onChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || loading}
            className="h-12 py-2 text-base font-semibold tracking-wide"
          />
        </div>
        <Button
          onClick={onSearch}
          loading={loading}
          disabled={disabled}
          className="h-12 w-full shrink-0 px-6 sm:w-auto"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Buscar
        </Button>
      </div>
      <p className="mt-2 text-xs text-opticolor-gray-400">
        Cargaremos cliente, ítems y prescripción automáticamente.
      </p>
    </div>
  );
};

export default OrderSearchBar;
