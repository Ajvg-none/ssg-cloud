'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { listCategories } = require('../../src/warrantyCategories');
const { getTemporaryBlockReason } = require('../../src/services/warrantyTypePolicy');

const LAB_TYPES = [
  'Material no Solicitado',
  'Formula no solicitada',
  'Material Dañado',
];

test('LABORATORIO expone los tres tipos temporales en el catálogo', () => {
  const lab = listCategories().find((c) => c.key === 'LABORATORIO');
  assert.ok(lab);
  assert.deepEqual(lab.warrantyTypes, LAB_TYPES);
  assert.deepEqual(lab.blockedWarrantyTypes, LAB_TYPES);
  assert.match(lab.blockedReason, /lógica de negocio/i);
});

test('los tres tipos temporales devuelven bloqueo 400 controlado', () => {
  for (const type of LAB_TYPES) {
    const reason = getTemporaryBlockReason(type);
    assert.ok(reason, `debe bloquear ${type}`);
    assert.match(reason, new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(reason, /temporalmente no disponible/i);
  }
});

test('los tipos vigentes de TIENDA no se bloquean', () => {
  assert.equal(getTemporaryBlockReason('Error de Medida'), null);
  assert.equal(getTemporaryBlockReason('Error de RX'), null);
  assert.equal(getTemporaryBlockReason(''), null);
  assert.equal(getTemporaryBlockReason(null), null);
});
