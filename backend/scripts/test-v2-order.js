// backend/scripts/test-v2-order.js
//
// QA de la migración GesVision v1 → v2.
// Uso:
//   node scripts/test-v2-order.js                 (lista la primera orden óptica)
//   node scripts/test-v2-order.js 113200000336    (busca por número/código)
//   node scripts/test-v2-order.js 12345 --id       (trata el argumento como ID interno)
//
// Verifica: auth v1 → JWT válido en v2, listado/envelope, búsqueda RSQL,
// mapeo (DP invertida, lensType) e items desde sales-invoices/sales-orders.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const config = require('../src/config/gesvision');
const gesvisionApi = require('../src/legacy/gesvisionApi');
const { mapOpticalOrderV2ToV1 } = require('../src/legacy/opticalOrderV2Mapper');
const { fetchAndMapOrder } = require('../src/legacy/fetchAndMapOrder');

let pass = 0;
let fail = 0;
function check(label, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const byId = args.includes('--id');
  const identifier = args.find(a => !a.startsWith('--')) || null;

  console.log('====================================================');
  console.log(' QA GesVision v2 — SGG Cloud');
  console.log('====================================================');
  console.log(`  Base v1   : ${config.apiUrl}`);
  console.log(`  Base v2   : ${config.apiV2Url}`);
  console.log(`  Usuario   : ${config.user}`);
  console.log(`  Argumento : ${identifier || '(ninguno → primera orden del listado)'}`);
  console.log('----------------------------------------------------');

  // 1. Auth
  console.log('\n[1] Autenticación (signin v1)');
  let token;
  try {
    token = await gesvisionApi.getToken();
    check('Token obtenido', !!token, token ? `${String(token).slice(0, 12)}…` : 'sin token');
  } catch (err) {
    check('Token obtenido', false, err.message);
    console.log('\nNo se puede continuar sin token.');
    return finish();
  }

  // 2. Resolver orden (lista + detalle)
  console.log('\n[2] Listado / detalle v2');
  let listItem = null;
  let detail = null;
  try {
    if (identifier && !byId) {
      listItem = await gesvisionApi.getOpticalOrderByNumber(identifier);
      check('Búsqueda por número/código', !!listItem, listItem ? `id=${listItem.id}` : 'no encontrada');
      detail = await gesvisionApi.getOpticalOrder(listItem.id);
    } else if (identifier && byId) {
      detail = await gesvisionApi.getOpticalOrder(identifier);
    } else {
      const page = await gesvisionApi.listOpticalOrders({ limit: 1, sort: 'lastModifiedAt:desc' });
      const data = gesvisionApi.extractData(page);
      listItem = data[0] || null;
      check('Listado con envelope {data,totalCount,skip,limit,hasMore}', Array.isArray(data) && page && 'totalCount' in page,
        page ? `totalCount=${page.totalCount}` : 'sin envelope');
      if (listItem) detail = await gesvisionApi.getOpticalOrder(listItem.id);
    }
    check('Detalle OpticalOrderDocument obtenido', !!detail, detail ? `code=${detail.code} number=${detail.number}` : 'sin detalle');
  } catch (err) {
    check('Obtención de orden', false, err.message);
    return finish();
  }
  if (!detail) return finish();

  // 3. Mapeo v2 → v1
  console.log('\n[3] Mapeo (opticalOrderV2Mapper)');
  let mapped;
  try {
    mapped = mapOpticalOrderV2ToV1(detail, listItem);
    check('Mapper ejecutado', !!mapped.opticalDataOD && !!mapped.opticalDataOI);
  } catch (err) {
    check('Mapper ejecutado', false, err.message);
    return finish();
  }

  const r = detail.rightEye || {};
  const l = detail.leftEye || {};
  console.log(`  v2 rightEye: farMonocularPd=${r.farMonocularPd} nearMonocularPd=${r.nearMonocularPd} lensType=${r.lensType}`);
  console.log(`  v2 leftEye : farMonocularPd=${l.farMonocularPd} nearMonocularPd=${l.nearMonocularPd} lensType=${l.lensType}`);
  console.log(`  v1 OD: distancePupilCenter=${mapped.opticalDataOD.distancePupilCenter} nearPupilCenter=${mapped.opticalDataOD.nearPupilCenter} lensType=${mapped.opticalDataOD.lensType}`);
  console.log(`  v1 OI: distancePupilCenter=${mapped.opticalDataOI.distancePupilCenter} nearPupilCenter=${mapped.opticalDataOI.nearPupilCenter} lensType=${mapped.opticalDataOI.lensType}`);

  // DP invertida: v2 nearMonocularPd -> v1 distancePupilCenter
  if (r.nearMonocularPd !== undefined && r.nearMonocularPd !== null) {
    check('DP lejos (OD): nearMonocularPd → distancePupilCenter',
      mapped.opticalDataOD.distancePupilCenter === r.nearMonocularPd);
  }
  if (r.farMonocularPd !== undefined && r.farMonocularPd !== null) {
    check('DP cerca (OD): farMonocularPd → nearPupilCenter',
      mapped.opticalDataOD.nearPupilCenter === r.farMonocularPd);
  }
  const VALID_LENS = ['L', 'C', 'B', 'P', null];
  check('lensType OD normalizado a código v1 (L/C/B/P)',
    VALID_LENS.includes(mapped.opticalDataOD.lensType), String(mapped.opticalDataOD.lensType));
  check('orderFromSupplier booleano',
    typeof mapped.orderFromSupplier === 'boolean', String(mapped.orderFromSupplier));

  // 4. Flujo completo fetchAndMapOrder
  console.log('\n[4] fetchAndMapOrder (flujo de producción)');
  try {
    const id = detail.code || detail.number || detail.id;
    const result = await fetchAndMapOrder(id);
    check('Orden mapeada con contrato de salida', !!result.orden_numero, `orden_numero=${result.orden_numero}`);
    check('codigo_completo presente', !!result.codigo_completo, String(result.codigo_completo));
    check('tipo_lente definido', !!result.tipo_lente, String(result.tipo_lente));
    check('items[] presente', Array.isArray(result.items), `${result.items.length} ítem(s)`);
    check('tienda_nombre resuelta', !!result.tienda_nombre, String(result.tienda_nombre));
    console.log('  ---- resumen ----');
    console.log(`  OD  Esf=${result.od_esfera} Cil=${result.od_cilindro} Eje=${result.od_eje} Add=${result.od_adicion} DPu=${result.od_dp_unico} DPc=${result.od_dp_centro} DPcer=${result.od_dp_cerca}`);
    console.log(`  OI  Esf=${result.oi_esfera} Cil=${result.oi_cilindro} Eje=${result.oi_eje} Add=${result.oi_adicion} DPu=${result.oi_dp_unico} DPc=${result.oi_dp_centro} DPcer=${result.oi_dp_cerca}`);
    console.log(`  Alturas: OD=${result.altura_od} OI=${result.altura_oi} | Tipo=${result.tipo_lente} | Asesor=${result.asesor_nombre}`);
  } catch (err) {
    check('fetchAndMapOrder', false, err.message);
  }

  return finish();
}

function finish() {
  console.log('\n====================================================');
  console.log(` RESULTADO: ${pass} PASS / ${fail} FAIL`);
  console.log('====================================================');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
