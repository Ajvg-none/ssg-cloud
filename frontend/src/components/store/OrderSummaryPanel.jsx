// frontend/src/components/store/OrderSummaryPanel.jsx
// Panel lateral (desktop sticky) y compacto (móvil) con el resumen en vivo
// de la orden + la garantía en construcción, checklist y CTA.
// 100% presentacional.
import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

const Row = ({ label, value, strong = false }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-opticolor-gray-400">{label}</dt>
    <dd
      className={`min-w-0 break-words text-right text-sm ${
        strong ? 'font-semibold text-opticolor-gray-900' : 'font-medium text-opticolor-gray-700'
      }`}
    >
      {value}
    </dd>
  </div>
);

const OrderSummaryPanel = ({ order, selections = [], checklist = [], footer = null, footerNote, className = '' }) => (
  <aside className={`min-w-0 lg:sticky lg:top-24 ${className}`}>
    <div className="overflow-hidden rounded-2xl border border-opticolor-gray-200 bg-white shadow-card">
      <div className="border-b border-opticolor-gray-100 px-5 py-4 sm:px-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-opticolor-gray-500">Resumen</h2>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {/* Orden cargada */}
        {order ? (
          <dl className="space-y-2.5">
            <div className="rounded-lg bg-opticolor-gray-50 px-3 py-2 text-center font-mono text-sm font-bold text-opticolor-gray-900">
              {order.code}
            </div>
            <Row label="Cliente" value={order.clientName} strong />
            {order.advisor && <Row label="Asesor" value={order.advisor} />}
            {order.saleDate && <Row label="Fecha de venta" value={order.saleDate} />}
            {order.saleAmount && <Row label="Monto" value={`$${order.saleAmount}${order.saleCurrency || ''}`} strong />}
            {order.paymentMethod && <Row label="Forma de pago" value={order.paymentMethod} />}
            <Row label="Ítems" value={`${order.itemsCount} artículo(s)`} />
          </dl>
        ) : (
          <p className="text-sm text-opticolor-gray-400">Sin orden cargada todavía.</p>
        )}

        {/* Garantía en construcción */}
        {selections.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400">Garantía</p>
            <ul className="space-y-1.5">
              {selections.map((s) => (
                <li key={s.label} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="shrink-0 text-opticolor-gray-500">{s.label}</span>
                  <span className={`min-w-0 break-words text-right font-medium ${s.value ? 'text-opticolor-gray-900' : 'text-opticolor-gray-300'}`}>
                    {s.value || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Checklist de progreso */}
        {checklist.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-opticolor-gray-400">Progreso</p>
            <ul className="space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCycleIcon />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-opticolor-gray-300" aria-hidden="true" />
                  )}
                  <span className={item.done ? 'font-medium text-opticolor-gray-800' : 'text-opticolor-gray-500'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {footer && (
        <div className="border-t border-opticolor-gray-100 px-5 py-4 sm:px-6">
          {footerNote && <p className="mb-2 text-xs font-medium text-opticolor-gray-500">{footerNote}</p>}
          {footer}
        </div>
      )}
    </div>
  </aside>
);

const CheckCycleIcon = () => (
  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
);

export default OrderSummaryPanel;
