'use strict';

// Contrato de la directiva para la categoría LABORATORIO:
// los 3 tipos están HABILITADOS; cualquiera NO genera VCA ni ticket
// (nada se entrega desde el lab), PERO SÍ genera la Orden A4 y nace COMPLETED.
// El mecanismo de bloqueo queda vacío, disponible para tipos futuros.

const test = require('node:test');
const assert = require('node:assert/strict');

const { listCategories } = require('../../src/warrantyCategories');
const { getTemporaryBlockReason } = require('../../src/services/warrantyTypePolicy');

const LAB_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];

test('LABORATORIO expone los tres tipos habilitados en el catálogo', () => {
  const lab = listCategories().find((c) => c.key === 'LABORATORIO');
  assert.ok(lab);
  assert.deepEqual(lab.warrantyTypes, LAB_TYPES);
  assert.deepEqual(lab.blockedWarrantyTypes, [], 'ningún tipo LAB queda bloqueado');
  assert.equal(lab.blockedReason, null);
});

test('ningún tipo de garantía vigente devuelve bloqueo temporal', () => {
  for (const type of LAB_TYPES) {
    assert.equal(getTemporaryBlockReason(type), null, `${type} debe estar habilitado`);
  }
  assert.equal(getTemporaryBlockReason('Error de Medida'), null);
  assert.equal(getTemporaryBlockReason('Error de RX'), null);
  assert.equal(getTemporaryBlockReason(''), null);
});

test('TIENDA mantiene su política de entrega estándar (VCA + ticket)', () => {
  const tienda = listCategories().find((c) => c.key === 'TIENDA');
  assert.equal(tienda.deliverVca, true);
  assert.equal(tienda.printTicket, true);
});

test('LABORATORIO declarara NO entrega de VCA ni ticket (Orden A4 sí)', () => {
  const lab = listCategories().find((c) => c.key === 'LABORATORIO');
  assert.equal(lab.deliverVca, false);
  assert.equal(lab.printTicket, false);
});
