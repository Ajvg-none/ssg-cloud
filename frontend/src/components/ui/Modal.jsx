// frontend/src/components/ui/Modal.jsx
import React, { useEffect, useRef } from 'react';

const Modal = ({ isOpen, onClose, title, children, size = 'lg' }) => {
  const closeButtonRef = useRef(null);
  // ✅ Ref para mantener siempre la última versión de onClose
  const onCloseRef = useRef(onClose);
  const titleId = useRef(
    `modal-title-${Math.random().toString(36).slice(2, 9)}`
  );

  // ✅ Sincroniza el ref sin provocar re-ejecuciones del efecto principal
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // ✅ Si el modal está cerrado, no hacemos nada
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    // ✅ El foco al botón ✕ ahora ocurre UNA SOLA VEZ al abrir el modal
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]); // ✅ ANTES: [isOpen, onClose] → el efecto se re-ejecutaba en cada tecla

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-opticolor-gray-900 bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        className={`
          relative bg-white rounded-xl shadow-modal w-full ${sizes[size]}
          max-h-[90vh] flex flex-col animate-slide-up
        `}
      >
        <div className="flex items-center justify-between p-6 border-b border-opticolor-gray-200">
          <h2 id={titleId.current} className="text-2xl font-bold text-opticolor-gray-900">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-opticolor-gray-400 hover:text-opticolor-red transition-colors text-2xl font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-opticolor-red rounded"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;