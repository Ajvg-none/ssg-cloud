// backend/src/ports/index.js
// Contratos (JSDoc) que implementan los adaptadores de infraestructura.
// En JavaScript no hay interfaces en runtime; estas definiciones documentan
// las dependencias inyectadas en los casos de uso.

/**
 * @typedef {Object} WarrantyRepository
 * @property {(data:Object)=>Promise<Object>} createNewPaidOrder
 * @property {(args:Object, enqueue?:Function)=>Promise<Object>} createWithNextRevision
 * @property {(id:string)=>Promise<Object|null>} findBasicById
 * @property {(id:string)=>Promise<Object|null>} findDetailedById
 * @property {(id:string)=>Promise<Object|null>} findWithRelationsById
 */

/**
 * @typedef {Object} OrderProvider
 * @property {(orderNumber:string)=>Promise<Object>} getOrder
 */

/**
 * @typedef {Object} ProductCatalog
 * @property {(code:string)=>Promise<Object|null>} getByCode
 */

/**
 * @typedef {Object} TicketRenderer
 * @property {(order:Object, items:Array)=>Promise<Buffer>} render
 */

/**
 * @typedef {Object} VcaDelivery
 * @property {(warranty:Object, store:Object, lab:Object)=>Promise<Object>} deliver
 */

/**
 * @typedef {Object} VcaOutbox
 * @property {(tx:Object, warrantyId:string)=>Promise<Object>} enqueue
 * @property {(options?:Object)=>Promise<number>} backfillFromPendingWarranties
 * @property {(limit?:number)=>Promise<Array>} claimDue
 * @property {(id:string)=>Promise<Object>} markDone
 * @property {(id:string, attempts:number, message:string, delayMs:number)=>Promise<Object>} markRetry
 * @property {(id:string, attempts:number, message:string)=>Promise<Object>} markFailed
 */

module.exports = {};
