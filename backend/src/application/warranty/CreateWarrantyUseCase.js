// backend/src/application/warranty/CreateWarrantyUseCase.js
// Orquesta la creación de garantías sin conocer Express, Prisma ni GesVision.
const {
  ValidationError,
  NotFoundError,
} = require('../../domain/errors');
const {
  applyNewArticleCodes,
  normalizeLensMaterialInput,
} = require('../../utils/warrantyCase');
const {
  isValidCategory,
  normalizeCategory,
  listWarrantyTypes,
  DEFAULT_CATEGORY,
  getCategory,
} = require('../../warrantyCategories');

const RX_TYPES = ['Error de RX', 'Error de Transcripcion'];

class CreateWarrantyUseCase {
  constructor({ warrantyRepo, storeRepo, productCatalog, outbox, logger }) {
    this.warrantyRepo = warrantyRepo;
    this.storeRepo = storeRepo;
    this.productCatalog = productCatalog;
    this.outbox = outbox;
    this.logger = logger;
  }

  async execute(input, actor) {
    const {
      orderNumber,
      orderData,
      warrantyType,
      storeObservations,
      affectedEyes,
      warrantyCase,
      newFrameCode,
      newLensCode,
      newOrderNumber,
      category,
    } = input || {};

    if (!orderNumber || !orderData) {
      throw new ValidationError('orderNumber y orderData son obligatorios.');
    }
    if (!warrantyType) {
      throw new ValidationError('El tipo de garantía es obligatorio.');
    }

    let warrantyCategory = DEFAULT_CATEGORY;
    if (category !== undefined && category !== null && String(category).trim() !== '') {
      warrantyCategory = normalizeCategory(category);
      if (!warrantyCategory || !isValidCategory(warrantyCategory)) {
        throw new ValidationError('Categoría de garantía inválida. Valores válidos: TIENDA, LABORATORIO.');
      }
      const typesForCategory = listWarrantyTypes(warrantyCategory);
      if (typesForCategory && typesForCategory.length === 0) {
        throw new ValidationError(
          `La categoría ${warrantyCategory} aún no tiene tipos de garantía definidos.`
        );
      }
    }

    if (storeObservations && storeObservations.length > 300) {
      throw new ValidationError('Las observaciones no pueden exceder 300 caracteres.');
    }

    const lensInput = normalizeLensMaterialInput({
      warrantyType,
      warrantyCase,
      newFrameCode,
      newLensCode,
      newOrderNumber,
    });
    if (lensInput.error) {
      throw new ValidationError(lensInput.error);
    }

    const {
      requiresVca,
      requiresTicket,
      isNewOrderPaid,
      normalizedCase,
      normalizedFrameCode,
      normalizedLensCode,
      normalizedNewOrder,
    } = lensInput;

    // ✅ NUEVO: política de entrega por CATEGORÍA (registry) combinada con la
    // lógica por TIPO. LABORATORIO declare deliverVca/printTicket=false: sus
    // tipos nacen COMPLETED, no encolan outbox ni pedido de ticket. TIENDA
    // (true/true) mantiene el comportamiento histórico (VCA/ticket salvo
    // Caso 2 de nueva OT pagada, que los pone false).
    const categoryDescriptor = getCategory(warrantyCategory);
    if (!categoryDescriptor) {
      throw new ValidationError('Categoría de garantía inválida. Valores válidos: TIENDA, LABORATORIO.');
    }
    const effectiveVca = requiresVca && categoryDescriptor.deliverVca;
    const effectiveTicket = requiresTicket && categoryDescriptor.printTicket;
    // Regla derivada (sin ifs por categoría): si la garantía no exige ninguna
    // entrega operativa, nace ya COMPLETED (registro + Orden A4, sin pendientes).
    const initialStatus = effectiveVca || effectiveTicket ? 'PENDING' : 'COMPLETED';

    let affectedEyesValue = null;
    if (RX_TYPES.includes(warrantyType)) {
      affectedEyesValue = ['OD', 'OI', 'BOTH'].includes(affectedEyes) ? affectedEyes : 'BOTH';
    }

    const store = await this.storeRepo.findById(actor.storeId);
    if (!store) throw new NotFoundError('Tienda no encontrada.');
    if (!store.accn || !/^\d{3}$/.test(store.accn)) {
      throw new ValidationError(
        'La tienda debe tener un código ACCN de 3 dígitos numéricos configurado para crear garantías.'
      );
    }
    if (!store.labId) {
      throw new ValidationError('La tienda no tiene un laboratorio asignado.');
    }

    let baseOrderData = orderData;
    if (normalizedCase === 'SAME_ORDER') {
      const newDescriptions = {};
      try {
        const [frameProduct, lensProduct] = await Promise.all([
          this.productCatalog.getByCode(normalizedFrameCode),
          this.productCatalog.getByCode(normalizedLensCode),
        ]);
        if (frameProduct?.description) newDescriptions.frame = frameProduct.description;
        if (lensProduct?.description) newDescriptions.lens = lensProduct.description;
        this.logger.info(
          `[createWarranty] Descripciones resueltas (Caso SAME_ORDER): montura=${
            newDescriptions.frame || 'sin cambio'
          }, cristal=${newDescriptions.lens || 'sin cambio'}`
        );
      } catch (descErr) {
        this.logger.warn(
          `[createWarranty] No se pudo resolver la descripción en GesVision: ${descErr.message}`
        );
      }
      baseOrderData = applyNewArticleCodes(
        orderData,
        normalizedFrameCode,
        normalizedLensCode,
        newDescriptions
      );
    }

    let createdWarranty;

    if (isNewOrderPaid) {
      const newOrderData = {
        ...baseOrderData,
        orden_numero: normalizedNewOrder,
        codigo_completo: normalizedNewOrder,
      };

      createdWarranty = await this.warrantyRepo.createNewPaidOrder({
        storeId: store.id,
        labId: store.labId,
        orderNumber: normalizedNewOrder,
        revision: 1,
        orderData: newOrderData,
        warrantyType,
        storeObservations: storeObservations || null,
        affectedEyes: null,
        warrantyCase: normalizedCase,
        newOrderNumber: normalizedNewOrder,
        category: warrantyCategory,
        requiresVca: false,
        requiresTicket: false,
        status: 'COMPLETED',
        processedAt: new Date(),
      });
    } else {
      const enqueue = effectiveVca
        ? (tx, warranty) => this.outbox.enqueue(tx, warranty.id)
        : null;

      createdWarranty = await this.warrantyRepo.createWithNextRevision(
        {
          baseOrderData,
          orderNumber,
          data: {
            storeId: store.id,
            labId: store.labId,
            warrantyType,
            storeObservations: storeObservations || null,
            affectedEyes: affectedEyesValue,
            warrantyCase: normalizedCase,
            newFrameCode: normalizedFrameCode,
            newLensCode: normalizedLensCode,
            category: warrantyCategory,
            requiresVca: effectiveVca,
            requiresTicket: effectiveTicket,
            status: initialStatus,
            ...(initialStatus === 'COMPLETED' ? { processedAt: new Date() } : {}),
          },
        },
        enqueue
      );
    }

    this.logger.info(
      `✅ Garantía creada: ${createdWarranty.id} para orden ${createdWarranty.orderNumber} ` +
        `(Rev: ${createdWarranty.revision}) por tienda ${store.name}`
    );

    return createdWarranty;
  }
}

module.exports = CreateWarrantyUseCase;
