// frontend/src/components/store/CaseDecisionCards.jsx
// Decisión del caso "Error de Tipo de Lente (Material)": misma OT vs nueva OT
// pagada. Presentacional: `onChange` recibe 'SAME_ORDER' | 'NEW_ORDER' (los
// mismos valores que el store espera).
import React from 'react';
import { Repeat, FilePlus2 } from 'lucide-react';

const OPTIONS = [
  {
    value: 'SAME_ORDER',
    icon: Repeat,
    title: 'NO paga diferencia',
    description: 'Se reemplazan los artículos dentro de la misma OT.',
  },
  {
    value: 'NEW_ORDER',
    icon: FilePlus2,
    title: 'SÍ paga diferencia',
    description: 'El cliente paga; se genera una nueva OT pagada en GesVision.',
  },
];

const CaseDecisionCards = ({ value, onChange, disabled = false, error, idPrefix = 'warranty-case' }) => (
  <div
    role="radiogroup"
    aria-label="¿El cliente paga diferencia?"
    aria-describedby={error ? `${idPrefix}-error` : undefined}
  >
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value: val, icon: Icon, title, description }) => {
        const selected = value === val;
        return (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(val)}
            className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200 disabled:cursor-not-allowed ${
              selected
                ? 'border-opticolor-red bg-red-50'
                : 'border-opticolor-gray-200 bg-white hover:border-opticolor-gray-300'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                selected ? 'bg-opticolor-red text-white' : 'bg-opticolor-gray-100 text-opticolor-gray-500'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${selected ? 'text-opticolor-gray-900' : 'text-opticolor-gray-700'}`}>
                {title}
              </span>
              <span className="mt-0.5 block text-xs text-opticolor-gray-500">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
    {error && (
      <p id={`${idPrefix}-error`} className="mt-2 animate-fade-in text-sm text-opticolor-red-light">
        {error}
      </p>
    )}
  </div>
);

export default CaseDecisionCards;
