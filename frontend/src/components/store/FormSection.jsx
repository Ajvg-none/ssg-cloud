// frontend/src/components/store/FormSection.jsx
// Sección de formulario con numeración opcional. `card=false`_para usarla
// como bloque plano (sin caja).
import React from 'react';

const FormSection = ({ step, title, description, card = true, children, className = '' }) => (
  <section
    className={card ? `rounded-2xl border border-opticolor-gray-200 bg-white p-5 shadow-soft sm:p-6 ${className}` : className}
  >
    <header className="mb-4 flex items-start gap-3">
      {step != null && (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-opticolor-red text-xs font-bold text-white"
        >
          {step}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-opticolor-gray-900 sm:text-lg">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-opticolor-gray-500">{description}</p>}
      </div>
    </header>
    {children}
  </section>
);

export default FormSection;
