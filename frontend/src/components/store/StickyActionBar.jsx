// frontend/src/components/store/StickyActionBar.jsx
// Barra sticky de guardado para móvil, con motivo de deshabilitado visible.
// Presentacional: el CTA (Botón) llega como children desde la página.
import React from 'react';

const StickyActionBar = ({ visible = false, reason, children }) => {
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Guardar garantía"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-opticolor-gray-200 bg-white/95 px-4 py-3 shadow-modal backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        {reason && (
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-opticolor-gray-500">{reason}</p>
        )}
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
};

export default StickyActionBar;
