'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

test('mapper: invierte la Distancia Pupilar (riesgo clínico)', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const m = mapOpticalOrderV2ToV1(h.detail({
    rightEye: h.eye({ eye: 'RIGHT', farMonocularPd: 30.5, nearMonocularPd: 29.5 }),
    leftEye: h.eye({ eye: 'LEFT', farMonocularPd: 31, nearMonocularPd: 30 }),
  }));
  assert.equal(m.opticalDataOD.distancePupilCenter, 29.5, 'nearMonocularPd → distancePupilCenter (DP lejos)');
  assert.equal(m.opticalDataOD.nearPupilCenter, 30.5, 'farMonocularPd → nearPupilCenter (DP cerca)');
  assert.equal(m.opticalDataOI.distancePupilCenter, 30);
  assert.equal(m.opticalDataOI.nearPupilCenter, 31);
});

test('mapper: mapea ojos rightEye→OD, leftEye→OI', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const m = mapOpticalOrderV2ToV1(h.detail());
  assert.equal(m.opticalDataOD.eye, 'D');
  assert.equal(m.opticalDataOI.eye, 'I');
});

test('mapper: enums de lensType v2 → código v1', () => {
  const { mapLensType, mapOpticalOrderV2ToV1 } = h.freshMapper();
  const cases = {
    FAR: 'L', TORIC: 'L',
    NEAR: 'C', OCCUPATIONAL: 'C', INTERMEDIATE: 'C',
    BIFOCAL: 'B',
    PROGRESSIVE: 'P', MULTIFOCAL: 'P',
    L: 'L', C: 'C', B: 'B', P: 'P',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(mapLensType(input), expected, `${input} → ${expected}`);
  }
  // Passthrough de valores desconocidos
  assert.equal(mapLensType('RARO'), 'RARO');
  // Integración en el documento
  const m = mapOpticalOrderV2ToV1(h.detail({ rightEye: h.eye({ lensType: 'PROGRESSIVE' }) }));
  assert.equal(m.opticalDataOD.lensType, 'P');
});

test('mapper: asigna createdBy como creador/asesor y nombres de cabecera', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const m = mapOpticalOrderV2ToV1(h.detail({ createdBy: 'asesor_01' }));
  assert.equal(m.createdBy, 'asesor_01');
  assert.equal(m.customerName, 'Juan Perez');
  assert.equal(m.warehouseName, 'Santo Tomé');
});

test('mapper: geometría de montura y cabecera', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const m = mapOpticalOrderV2ToV1(h.detail());
  assert.equal(m.code, '114200001925');
  assert.equal(m.number, 1925);
  assert.equal(m.series ?? m.serial, '1142');
  assert.equal(m.horizontal, 54);
  assert.equal(m.vertical, 39);
  assert.equal(m.bridge, 17);
  assert.equal(m.maxDiameter, 58);
  assert.equal(m.heightOD, 24, 'heightRightEye → heightOD');
  assert.equal(m.heightOI, 25, 'heightLeftEye → heightOI');
});

test('mapper: orderFromSupplier booleano estricto', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  assert.equal(mapOpticalOrderV2ToV1(h.detail({ requestSupplier: true })).orderFromSupplier, true);
  assert.equal(mapOpticalOrderV2ToV1(h.detail({ requestSupplier: undefined })).orderFromSupplier, false);
});

test('mapper: no rompe con ojos ausentes y preserva ceros', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const empty = mapOpticalOrderV2ToV1(h.detail({ rightEye: undefined, leftEye: undefined }));
  assert.equal(empty.opticalDataOD.sphere, null);
  assert.equal(empty.opticalDataOI.sphere, null);

  const zero = mapOpticalOrderV2ToV1(h.detail({
    rightEye: h.eye({ sphere: 0, cylinder: 0, farMonocularPd: 0, nearMonocularPd: 0 }),
  }));
  assert.equal(zero.opticalDataOD.sphere, 0, 'sphere 0 no debe convertirse en null');
  assert.equal(zero.opticalDataOD.cylinder, 0);
  assert.equal(zero.opticalDataOD.nearPupilCenter, 0);
  assert.equal(zero.opticalDataOD.distancePupilCenter, 0);
});

test('mapper: usa el item de lista como fallback de campos omitidos', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  const listItem = h.listItem({ documentDate: '2026-01-01T00:00:00+01:00', invoiceId: 999 });
  const m = mapOpticalOrderV2ToV1(h.detail({ documentDate: null, invoiceId: null }), listItem);
  assert.equal(m.date, '2026-01-01T00:00:00+01:00');
  assert.equal(m.issuedInvoiceId, 999);
});

test('mapper: v2Detail inválido → throw', () => {
  const { mapOpticalOrderV2ToV1 } = h.freshMapper();
  assert.throws(() => mapOpticalOrderV2ToV1(null), /inválido/);
  assert.throws(() => mapOpticalOrderV2ToV1(undefined), /inválido/);
  assert.throws(() => mapOpticalOrderV2ToV1('texto'), /inválido/);
});
