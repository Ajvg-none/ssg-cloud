// frontend/src/components/store/RxEyeSection.jsx
// Tarjeta comparada de un ojo (OD / OI). Recibe handlers y flags de la página;
// NO tiene estado propio y no toca la lógica de bloqueo (`isFieldDisabled`).
import React from 'react';
import { Eye } from 'lucide-react';
import Input from '../ui/Input';

// Config declarativa: `altura` usa la convención especial altura_OD / altura_OI.
const BASE_FIELDS = [
  { base: 'esfera', label: 'Esfera', step: '0.01' },
  { base: 'cilindro', label: 'Cilindro', step: '0.01' },
  { base: 'eje', label: 'Eje', min: '0', max: '180' },
  { base: 'adicion', label: 'Adición', step: '0.01' },
  { base: 'dp_centro', label: 'DP Centro', step: '0.1' },
  { base: 'dp_cerca', label: 'DP Cerca', step: '0.1' },
  { base: 'altura', label: 'Altura', step: '0.1' },
];

const normalizeField = (prefix, base) =>
  base === 'altura' ? `altura_${prefix.toLowerCase()}` : `${prefix}_${base}`;

const BADGE_TONES = {
  accent: 'border-red-200 bg-red-50 text-opticolor-red-dark',
  neutral: 'border-opticolor-gray-200 bg-opticolor-gray-50 text-opticolor-gray-600',
  muted: 'border-opticolor-gray-200 bg-white text-opticolor-gray-400',
};

const RxEyeSection = ({
  prefix,            // 'OD' | 'OI'
  title,             // 'Ojo Derecho'
  affected = null,   // true | false | null (null = el tipo no usa ojos)
  orderData,
  errors,
  saving,
  isFieldDisabled,
  onFieldChange,
}) => {
  const active = affected === null ? true : affected;
  const eyeLocked = affected === false;
  const badge =
    affected === null
      ? { text: 'Editable', tone: 'neutral' }
      : affected
        ? { text: 'Afectado', tone: 'accent' }
        : { text: 'No afectado', tone: 'muted' };

  return (
    <section
      className={`min-w-0 rounded-xl border p-4 transition-colors sm:p-5 ${
        active ? 'border-opticolor-gray-200' : 'border-opticolor-gray-100'
      } ${eyeLocked ? 'bg-opticolor-gray-50 opacity-70' : 'bg-white'}`}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-opticolor-gray-900">
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              active ? 'bg-red-50 text-opticolor-red' : 'bg-opticolor-gray-100 text-opticolor-gray-400'
            }`}
          >
            <Eye className="h-4 w-4" />
          </span>
          <span className="truncate">
            {title} <span className="font-medium text-opticolor-gray-400">({prefix})</span>
          </span>
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONES[badge.tone]}`}
        >
          {badge.text}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {BASE_FIELDS.map((f) => {
          const field = normalizeField(prefix, f.base);
          return (
            <Input
              key={f.base}
              label={f.label}
              type="number"
              step={f.step}
              min={f.min}
              max={f.max}
              value={orderData[field] ?? ''}
              onChange={(e) => onFieldChange(field, e.target.value)}
              error={errors[field]}
              disabled={eyeLocked || isFieldDisabled(field) || saving}
              className="tabular-nums"
            />
          );
        })}
      </div>

      {affected === false && (
        <p className="mt-3 text-xs text-opticolor-gray-400">
          Se activa al marcar este ojo como afectado.
        </p>
      )}
    </section>
  );
};

export default RxEyeSection;
