// frontend/src/components/store/WarrantyStepper.jsx
// Stepper derivado del estado: Buscar OTG → Clasificar → Revisar y guardar.
// 100% presentacional; `current` lo calcula la página.
// En móvil se ocultan las etiquetas (siguen en el DOM para lectores de pantalla)
// para que los círculos y conectores no desborden.
import React from 'react';
import { Check } from 'lucide-react';

const STEPS = ['Buscar OTG', 'Clasificar', 'Revisar y guardar'];

const WarrantyStepper = ({ current = 1, className = '' }) => (
  <ol className={`flex items-center gap-2 sm:gap-3 ${className}`} aria-label="Pasos de la garantía">
    {STEPS.map((label, idx) => {
      const n = idx + 1;
      const done = n < current;
      const isCurrent = n === current;
      return (
        <React.Fragment key={label}>
          <li className="flex items-center gap-0 sm:gap-2" aria-current={isCurrent ? 'step' : undefined}>
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                done
                  ? 'bg-opticolor-red text-white'
                  : isCurrent
                    ? 'border-2 border-opticolor-red bg-white text-opticolor-red'
                    : 'border border-opticolor-gray-300 bg-white text-opticolor-gray-400'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            <span
              className={`min-w-0 truncate text-sm font-semibold sm:not-sr-only ${
                isCurrent || done ? 'text-opticolor-gray-900' : 'text-opticolor-gray-400'
              } sr-only`}
            >
              {label}
            </span>
          </li>
          {n < STEPS.length && (
            <li aria-hidden="true" className={`h-px flex-1 ${done ? 'bg-opticolor-red' : 'bg-opticolor-gray-200'}`} />
          )}
        </React.Fragment>
      );
    })}
  </ol>
);

export default WarrantyStepper;
