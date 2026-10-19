import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Genera SIEMPRE la misma cantidad de slots (7 cuando hay más de 7 páginas)
// para que el ancho del paginador no "salte" al cambiar de página.
const buildPageNumbers = (page, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (page >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', page - 1, page, page + 1, '...', totalPages];
};

const Pagination = ({ page, totalPages, onChange, className = '' }) => {
  const pages = Math.max(1, totalPages);
  const pageNumbers = buildPageNumbers(page, pages);

  // min-w + h fijos: todos los slots (números, "…" y flechas) miden lo mismo
  const baseBtn =
    'inline-flex items-center justify-center min-w-[36px] h-9 px-2 rounded-lg text-sm font-medium transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav className={`flex items-center gap-1 ${className}`} aria-label="Paginación">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
        className={`${baseBtn} text-opticolor-gray-600 hover:bg-opticolor-gray-100`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {pageNumbers.map((num, idx) =>
        num === '...' ? (
          <span
            key={`dots-${idx}`}
            className="inline-flex items-center justify-center min-w-[36px] h-9 text-opticolor-gray-400 select-none"
          >
            …
          </span>
        ) : (
          <button
            key={num}
            onClick={() => onChange(num)}
            aria-current={num === page ? 'page' : undefined}
            className={`${baseBtn} ${
              num === page
                ? 'bg-opticolor-red text-white shadow-sm'
                : 'text-opticolor-gray-600 hover:bg-opticolor-gray-100'
            }`}
          >
            {num}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label="Página siguiente"
        className={`${baseBtn} text-opticolor-gray-600 hover:bg-opticolor-gray-100`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
};

export default Pagination;