// frontend/src/components/ui/WarrantyDetailModal.jsx
import React from 'react';
import Modal from './Modal';
import Button from './Button';
import StatusBadge from './StatusBadge';
import { Info, ShieldAlert, Eye, Ruler, Package, MessageSquare } from 'lucide-react';
import { formatDate } from '../../utils/format';

const OrderNumber = ({ code }) => {
  if (!code) return <span className="text-sm text-opticolor-gray-400">-</span>;
  const idx = code.lastIndexOf('-');
  const suffix = idx > 0 ? code.slice(idx + 1) : '';
  const hasRevision = suffix !== '' && /^\d+$/.test(suffix);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={code}>
      <span className="text-base font-bold text-opticolor-gray-900 tabular-nums tracking-tight">
        {hasRevision ? code.slice(0, idx) : code}
      </span>
      {hasRevision && (
        <span className="rounded-md border border-opticolor-gray-200 bg-opticolor-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-opticolor-gray-500">
          R{suffix}
        </span>
      )}
    </span>
  );
};

// ✅ NUEVO: etiquetas legibles para los ojos afectados
const AFFECTED_EYES_LABELS = {
  OD: 'Ojo Derecho (OD)',
  OI: 'Ojo Izquierdo (OI)',
  BOTH: 'Ambos ojos',
};

const Section = ({ icon: Icon, title, children }) => (
  <section className="overflow-hidden rounded-xl border border-opticolor-gray-200 bg-white">
    <header className="flex items-center gap-2 border-b border-opticolor-gray-200 bg-opticolor-gray-50 px-4 py-2.5">
      <Icon className="h-4 w-4 text-opticolor-red" aria-hidden="true" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-opticolor-gray-700">{title}</h3>
    </header>
    <div className="p-4">{children}</div>
  </section>
);

const Field = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-opticolor-gray-400">{label}</p>
    <div className="mt-0.5 text-sm font-medium text-opticolor-gray-800">{children}</div>
  </div>
);

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-opticolor-gray-100 bg-opticolor-gray-50 px-3 py-2 text-center">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-opticolor-gray-400">{label}</p>
    <p className="mt-0.5 text-sm font-bold text-opticolor-gray-800 tabular-nums">{value ?? '-'}</p>
  </div>
);

const RxValue = ({ value, suffix = '' }) => (
  <span className="text-sm font-medium text-opticolor-gray-800 tabular-nums">
    {value ?? '-'}{value != null && value !== '' ? suffix : ''}
  </span>
);

const WarrantyDetailModal = ({ isOpen, onClose, warranty }) => {
  const od = warranty?.orderData || null;
  // ✅ NUEVO: ¿el tipo de garantía usa ojos afectados?
  const isRXType =
    warranty?.warrantyType === 'Error de RX' ||
    warranty?.warrantyType === 'Error de Transcripcion';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle de Garantía" size="lg">
      {warranty && (
        <div className="space-y-4">
          {/* Barra de resumen: OTG + estado + fecha + tipo */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-opticolor-gray-200 bg-opticolor-gray-50 px-4 py-3">
            <OrderNumber code={warranty.orderNumber} />
            <StatusBadge status={warranty.status} />
            <span className="text-sm text-opticolor-gray-500 tabular-nums">{formatDate(warranty.createdAt)}</span>
            {warranty.warrantyType && (
              <span className="ml-auto rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-opticolor-red">
                {warranty.warrantyType}
              </span>
            )}
          </div>

          {/* Información general (campos según datos disponibles) */}
          <Section icon={Info} title="Información General">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Cliente">{od?.cliente_nombre || '-'}</Field>
              {od?.asesor_nombre && <Field label="Asesor / Responsable">{od.asesor_nombre}</Field>}
              {warranty.store?.name && (
                <Field label="Tienda">{warranty.store.name}{warranty.store.accn ? ` (${warranty.store.accn})` : ''}</Field>
              )}
              {warranty.lab?.name && <Field label="Laboratorio">{warranty.lab.name}</Field>}

              {/* ✅ NUEVO: Fecha de la Venta Original */}
              {od?.fecha_venta && (
                <Field label="Fecha de Venta">
                  <span className="text-sm font-medium text-opticolor-gray-800">
                    {new Date(od.fecha_venta + 'T12:00:00').toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </Field>
              )}

              {/* ✅ NUEVO: Monto de Venta (siempre en USD) */}
              {od?.monto_total_usd !== null && od?.monto_total_usd !== undefined && (
                <Field label="Monto de Venta">
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-green-700">
                      ${new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(od.monto_total_usd)}
                    </span>
                    {od.moneda_original === 'VES' && (
                      <span className="text-[10px] text-opticolor-gray-500 italic">
                        (Facturado en Bs. y convertido a tasa BCV del día)
                      </span>
                    )}
                  </div>
                </Field>
              )}

              {/* ✅ NUEVO: Forma de Pago */}
              {od?.metodo_pago && od.metodo_pago !== 'No especificado' && (
                <Field label="Forma de Pago">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                    {od.metodo_pago}
                  </span>
                </Field>
              )}

              {od?.codigo_completo && <Field label="Código Completo"><span className="tabular-nums">{od.codigo_completo}</span></Field>}
              {od?.tipo_lente && <Field label="Tipo de Lente">{od.tipo_lente}</Field>}
            </div>
          </Section>

          {/* Datos de la garantía */}
          <Section icon={ShieldAlert} title="Datos de la Garantía">
            {/* ✅ NUEVO: grid con Tipo + Ojos Afectados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tipo de Garantía">{warranty.warrantyType || '-'}</Field>
              {isRXType && (
                <Field label="Ojos Afectados">
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-opticolor-red">
                    {AFFECTED_EYES_LABELS[warranty.affectedEyes] || 'No especificado'}
                  </span>
                </Field>
              )}
            </div>
            {warranty.storeObservations && (
              <div className="mt-3 flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 min-w-0">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" aria-hidden="true" />
                <p className="flex-1 min-w-0 w-full max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm italic text-yellow-800">{warranty.storeObservations}</p>
              </div>
            )}
          </Section>

          {od && (
            <>
              {/* Prescripción óptica OD/OI en tabla */}
              <Section icon={Eye} title="Prescripción Óptica">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-opticolor-red bg-opticolor-gray-100">
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Ojo</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Esfera</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Cilindro</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Eje</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Adición</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">DP</th>
                        <th className="py-2 px-3 text-center text-xs font-bold uppercase tracking-wider text-opticolor-gray-600">Altura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-opticolor-gray-100">
                      <tr>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded-md bg-opticolor-red/10 text-xs font-bold text-opticolor-red">OD</span>
                        </td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.od_esfera} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.od_cilindro} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.od_eje} suffix="°" /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.od_adicion} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.od_dp_centro ?? od.od_dp_cerca} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.altura_od} /></td>
                      </tr>
                      <tr className="bg-opticolor-gray-50/60">
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex h-6 w-9 items-center justify-center rounded-md bg-blue-500/10 text-xs font-bold text-blue-600">OI</span>
                        </td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.oi_esfera} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.oi_cilindro} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.oi_eje} suffix="°" /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.oi_adicion} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.oi_dp_centro ?? od.oi_dp_cerca} /></td>
                        <td className="py-2.5 px-3 text-center"><RxValue value={od.altura_oi} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Medidas de montura */}
              <Section icon={Ruler} title="Medidas de Montura">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Horizontal" value={od.montura_horizontal} />
                  <Stat label="Vertical" value={od.montura_vertical} />
                  <Stat label="Puente" value={od.montura_puente} />
                  <Stat label="Diámetro Máx" value={od.montura_diametro_max} />
                </div>
              </Section>

              {/* Ítems de la orden */}
              {od.items?.length > 0 && (
                <Section icon={Package} title="Ítems de la Orden">
                  <div className="divide-y divide-opticolor-gray-100 overflow-hidden rounded-lg border border-opticolor-gray-200">
                    {od.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3 even:bg-opticolor-gray-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-opticolor-gray-800" title={item.descripcion}>{item.descripcion}</p>
                          {item.codigo_completo && <p className="text-xs text-opticolor-gray-500 tabular-nums">{item.codigo_completo}</p>}
                        </div>
                        {item.es_montura && (
                          <span className="shrink-0 rounded bg-opticolor-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Montura</span>
                        )}
                        {item.es_cristal && (
                          <span className="shrink-0 rounded bg-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Cristal</span>
                        )}
                        <span className="w-10 shrink-0 text-right text-sm font-semibold text-opticolor-gray-700 tabular-nums">x{item.cantidad}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* Footer del modal */}
          <div className="flex justify-end pt-1">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default WarrantyDetailModal;