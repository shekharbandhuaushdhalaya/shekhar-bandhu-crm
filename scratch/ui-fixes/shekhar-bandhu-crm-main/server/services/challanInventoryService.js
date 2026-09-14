const mongoose = require('mongoose');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const { withTransaction } = require('../utils/withTransaction');

function inventoryError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function entryFilter(warehouseId, item) {
  const filter = {
    warehouseId,
    productId: item.productId,
    packing: item.packing || 1,
    vendorId: item.vendorId || '',
    batchNo: item.batchNo || '',
    qcStatus: item.qcStatus || 'approved'
  };
  return filter;
}

async function getOrCreateDestinationEntry({ warehouse, item, product, sourceEntry = null, session }) {
  const filter = entryFilter(warehouse._id, item);
  let entry = await InventoryEntry.findOne(filter).session(session);
  if (entry) return entry;

  entry = new InventoryEntry({
    warehouseId: warehouse._id,
    warehouseName: warehouse.name,
    productId: product._id,
    productType: product.productType || '',
    size: product.size || '',
    colour: product.colour || '',
    shape: product.shape || '',
    weight: product.weight || '',
    hsnCode: product.hsnCode || '',
    vendorId: item.vendorId || '',
    vendorName: item.vendorName || '',
    qtyBoxes: 0,
    packing: item.packing || 1,
    batchNo: item.batchNo || '',
    mfgDate: item.mfgDate || sourceEntry?.mfgDate || undefined,
    expiryDate: item.expiryDate || sourceEntry?.expiryDate || undefined,
    purchaseRate: item.rate || item.purchaseRate || 0,
    manufacturingUnitId: item.manufacturingUnitId || undefined,
    manufacturingUnitName: item.manufacturingUnitName || '',
    qcStatus: sourceEntry?.qcStatus || 'approved'
  });
  return entry;
}

async function postChallanInventory(challan, options = {}) {
  const actor = options.createdBy || 'System';
  const challanId = challan?._id || challan;

  return withTransaction(async (session) => {
    const Challan = require('../models/Challan');
    const fresh = await Challan.findById(challanId).session(session);
    if (!fresh) throw inventoryError('CHALLAN_NOT_FOUND', 'Challan not found');

    if (fresh.status === 'finalized' || fresh.inventoryPostingStatus === 'posted') {
      return fresh;
    }
    if (fresh.inventoryPostingStatus === 'reversed') {
      throw inventoryError('CHALLAN_REVERSED', 'A reversed Challan cannot be posted again');
    }
    if (fresh.status !== 'draft' || ['posting'].includes(fresh.inventoryPostingStatus)) {
      throw inventoryError('CHALLAN_NOT_POSTABLE', `Challan cannot be finalized from status: ${fresh.status}`);
    }
    if (!fresh.items?.length) throw inventoryError('CHALLAN_EMPTY', 'A Challan must contain at least one item');

    // Every Sale Challan must be linked to an active Sales Order. This invariant is
    // enforced here, inside the inventory transaction, so programmatic callers cannot
    // bypass order approval, customer ownership or remaining-quantity controls.
    let linkedOrder = null;
    let priorPostedChallans = [];
    if (fresh.challanType === 'sale') {
      if (!fresh.salesOrderId) {
        throw inventoryError('SALES_ORDER_REQUIRED', 'A linked Sales Order is required before a Sale Challan can be posted');
      }
      const Order = require('../models/Order');
      linkedOrder = await Order.findById(fresh.salesOrderId).session(session);
      if (!linkedOrder) throw inventoryError('ORDER_NOT_FOUND', 'Sales Order linked to Challan was not found');
      if (['draft', 'cancelled', 'fulfilled', 'shipped', 'delivered'].includes(linkedOrder.status)) {
        throw inventoryError('ORDER_NOT_FULFILLABLE', `Sales Order is ${linkedOrder.status}`);
      }
      if (linkedOrder.approvalRequired && linkedOrder.approvalStatus !== 'approved') {
        throw inventoryError('ORDER_APPROVAL_REQUIRED', 'Sales Order must be approved before its Challan can be posted');
      }
      if (!linkedOrder.customerId) {
        throw inventoryError('ORDER_CUSTOMER_REQUIRED', 'Sales Order must be linked to a customer');
      }
      if (fresh.customerId && String(fresh.customerId) !== String(linkedOrder.customerId)) {
        throw inventoryError('ORDER_CUSTOMER_MISMATCH', 'Challan customer does not match the Sales Order customer');
      }
      if (!fresh.customerId) fresh.customerId = linkedOrder.customerId;

      priorPostedChallans = await Challan.find({
        _id: { $ne: fresh._id }, salesOrderId: linkedOrder._id,
        status: 'finalized', inventoryPostingStatus: 'posted'
      }).session(session).lean();

      const priorPhysical = new Map();
      const priorBillable = new Map();
      for (const c of priorPostedChallans) for (const it of c.items || []) {
        const k = String(it.productId);
        const physical = Number(it.qty || 0);
        const billable = it.billableQty == null ? physical : Number(it.billableQty || 0);
        priorPhysical.set(k, (priorPhysical.get(k) || 0) + physical);
        priorBillable.set(k, (priorBillable.get(k) || 0) + billable);
      }

      const currentPhysical = new Map();
      const currentBillable = new Map();
      for (const line of fresh.items) {
        const k = String(line.productId || '');
        const oi = linkedOrder.items.find(x => String(x.productId) === k);
        if (!oi) throw inventoryError('ORDER_ITEM_NOT_FOUND', `Challan item ${line.name || k} does not belong to the Sales Order`);
        const physical = Number(line.qty || 0);
        const alreadyPhysical = priorPhysical.get(k) || 0;
        const alreadyCurrent = currentPhysical.get(k) || 0;
        const allowedPhysical = Number(oi.qty || 0) + Number(oi.freeQty || 0);
        if (alreadyPhysical + alreadyCurrent + physical > allowedPhysical + 1e-9) {
          throw inventoryError('FULFILLMENT_EXCEEDS_REMAINING', `${oi.name}: fulfillment exceeds ordered + free quantity`);
        }
        // Billable/free allocation is authoritative at posting time. Never trust a draft
        // Challan's split because two drafts may have been prepared concurrently against
        // the same remaining paid quantity. Paid units are allocated first; the rest are
        // promotional/free physical units.
        const paidRemaining = Math.max(0,
          Number(oi.qty || 0) - (priorBillable.get(k) || 0) - (currentBillable.get(k) || 0));
        const billable = Math.min(physical, paidRemaining);
        line.billableQty = billable;
        line.freeQty = Math.max(0, physical - billable);
        currentBillable.set(k, (currentBillable.get(k) || 0) + billable);
        currentPhysical.set(k, alreadyCurrent + physical);
      }
    }

    fresh.inventoryPostingStatus = 'posting';
    await fresh.save({ session });

    const sourceWarehouseId = fresh.warehouseId;
    const isTransfer = ['transfer', 'production_transfer'].includes(fresh.challanType);
    const destinationWarehouseId = fresh.destinationWarehouseId || null;

    if (!sourceWarehouseId) throw inventoryError('SOURCE_WAREHOUSE_REQUIRED', 'Source warehouse is required');
    if (isTransfer && !destinationWarehouseId) throw inventoryError('DESTINATION_WAREHOUSE_REQUIRED', 'Destination warehouse is required for a transfer Challan');
    if (isTransfer && String(sourceWarehouseId) === String(destinationWarehouseId)) {
      throw inventoryError('SAME_WAREHOUSE_TRANSFER', 'Source and destination warehouses must be different');
    }

    const [sourceWarehouse, destinationWarehouse] = await Promise.all([
      Warehouse.findById(sourceWarehouseId).session(session),
      isTransfer ? Warehouse.findById(destinationWarehouseId).session(session) : null
    ]);
    if (!sourceWarehouse) throw inventoryError('SOURCE_WAREHOUSE_NOT_FOUND', 'Source warehouse not found');
    if (isTransfer && !destinationWarehouse) throw inventoryError('DESTINATION_WAREHOUSE_NOT_FOUND', 'Destination warehouse not found');

    // Aggregate duplicate lines so one product/batch is never deducted twice accidentally.
    const aggregated = new Map();
    for (const item of fresh.items) {
      if (!item.productId) throw inventoryError('PRODUCT_REQUIRED', `Product is required for Challan ${fresh.challanNo}`);
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) throw inventoryError('INVALID_QUANTITY', `Invalid quantity for ${item.name || item.productId}`);
      const key = [item.productId.toString(), item.vendorId || '', item.packing || 1, item.batchNo || ''].join('|');
      const existing = aggregated.get(key);
      if (existing) existing.qty += qty;
      else aggregated.set(key, { item, qty });
    }

    const ledgerWrites = [];
    let productStockDelta = new Map();

    for (const { item, qty } of aggregated.values()) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw inventoryError('PRODUCT_NOT_FOUND', `Product not found: ${item.productId}`);

      const filter = entryFilter(sourceWarehouse._id, item);
      const sourceStockFilter = fresh.challanType === 'sale'
        ? { ...filter, $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: new Date() } }], qtyBoxes: { $gte: qty } }
        : { ...filter, qtyBoxes: { $gte: qty } };
      const sourceEntry = await InventoryEntry.findOneAndUpdate(
        sourceStockFilter,
        { $inc: { qtyBoxes: -qty } },
        { new: true, session }
      );

      if (!sourceEntry) {
        const existing = await InventoryEntry.findOne(filter).session(session).lean();
        const available = existing ? existing.qtyBoxes : 0;
        throw inventoryError(
          'INSUFFICIENT_STOCK',
          `Insufficient stock for "${item.name || product.name}". Available: ${available} boxes, Required: ${qty} boxes.${item.batchNo ? ` Batch: ${item.batchNo}` : ''}`,
          { productId: product._id, warehouseId: sourceWarehouse._id, batchNo: item.batchNo || '', available, required: qty }
        );
      }

      item.qcStatus = sourceEntry?.qcStatus || item.qcStatus || 'approved';

      ledgerWrites.push({
        productId: product._id,
        warehouseId: sourceWarehouse._id,
        warehouseName: sourceWarehouse.name,
        type: 'OUT',
        qtyBoxes: -qty,
        balanceBoxes: sourceEntry.qtyBoxes,
        reference: fresh.challanNo,
        note: `${fresh.challanType === 'sale' ? 'SALE' : 'TRANSFER'} Challan ${fresh.challanNo} — OUT`,
        createdBy: actor,
        packing: item.packing || 1,
        vendorId: item.vendorId || '',
        vendorName: item.vendorName || '',
        batchNo: item.batchNo || '',
        manufacturingUnitId: item.manufacturingUnitId || undefined,
        manufacturingUnitName: item.manufacturingUnitName || '',
        movementKey: `${fresh._id}:OUT:${sourceWarehouse._id}:${product._id}:${item.batchNo || ''}:${item.packing || 1}:${item.vendorId || ''}`
      });

      // Product.stockLevel is the legacy firm-wide aggregate. Internal transfers must
      // not change the aggregate because stock moves between warehouses. Only sale
      // dispatches reduce it here.
      if (!isTransfer) {
        productStockDelta.set(product._id.toString(), (productStockDelta.get(product._id.toString()) || 0) - qty);
      }

      if (isTransfer) {
        const destinationEntry = await getOrCreateDestinationEntry({ warehouse: destinationWarehouse, item, product, sourceEntry, session });
        destinationEntry.qtyBoxes += qty;
        await destinationEntry.save({ session });

        ledgerWrites.push({
          productId: product._id,
          warehouseId: destinationWarehouse._id,
          warehouseName: destinationWarehouse.name,
          type: 'IN',
          qtyBoxes: qty,
          balanceBoxes: destinationEntry.qtyBoxes,
          reference: fresh.challanNo,
          note: `${fresh.challanType === 'production_transfer' ? 'PRODUCTION TRANSFER' : 'TRANSFER'} Challan ${fresh.challanNo} — IN`,
          createdBy: actor,
          packing: item.packing || 1,
          vendorId: item.vendorId || '',
          vendorName: item.vendorName || '',
          batchNo: item.batchNo || '',
          manufacturingUnitId: item.manufacturingUnitId || undefined,
          manufacturingUnitName: item.manufacturingUnitName || '',
          movementKey: `${fresh._id}:IN:${destinationWarehouse._id}:${product._id}:${item.batchNo || ''}:${item.packing || 1}:${item.vendorId || ''}`
        });
      }
    }

    // Keep legacy aggregate Product.stockLevel synchronized, but never allow it to hide a failed transaction.
    for (const [productId, delta] of productStockDelta.entries()) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, stockLevel: { $gte: -delta } },
        { $inc: { stockLevel: delta } },
        { new: true, session }
      );
      if (!updated) throw inventoryError('PRODUCT_STOCK_CONFLICT', 'Product aggregate stock changed concurrently. Please retry the Challan.');
    }

    // A unique movementKey makes duplicate ledger creation impossible for the same Challan line/direction.
    await StockLedger.insertMany(ledgerWrites, { session, ordered: true });

    fresh.status = 'finalized';
    fresh.inventoryPostingStatus = 'posted';
    fresh.inventoryPostedAt = new Date();
    fresh.inventoryPostedBy = options.userId || null;
    fresh.inventoryTransactionId = new mongoose.Types.ObjectId().toString();
    await fresh.save({ session });

    if (linkedOrder) {
      const posted = [...priorPostedChallans, fresh.toObject()];
      for (const oi of linkedOrder.items) {
        const fulfilled = posted.flatMap(c => c.items || [])
          .filter(it => String(it.productId) === String(oi.productId))
          .reduce((sum, it) => sum + Number(it.qty || 0), 0);
        oi.fulfilledQty = fulfilled;
        oi.backorderedQty = Math.max(0, Number(oi.qty || 0) + Number(oi.freeQty || 0) - fulfilled);
      }
      const done = linkedOrder.items.every(i => Number(i.backorderedQty || 0) <= 0);
      const any = linkedOrder.items.some(i => Number(i.fulfilledQty || 0) > 0);
      linkedOrder.status = done ? 'fulfilled' : (any ? 'partially_fulfilled' : 'processing');
      await linkedOrder.save({ session });
    }

    return fresh;
  });
}



/** Reverse a posted Challan through a new compensating inventory transaction. */
async function reverseChallanInventory(challan, options = {}) {
  return withTransaction(async (session) => {
    const Challan = require('../models/Challan');
    const fresh = await Challan.findById(challan._id).session(session);
    if (!fresh) throw inventoryError('CHALLAN_NOT_FOUND', 'Challan not found');
    if (fresh.status !== 'finalized' || fresh.inventoryPostingStatus !== 'posted') {
      throw inventoryError('CHALLAN_NOT_REVERSIBLE', 'Only a posted Challan can be reversed');
    }
    if (fresh.inventoryReversedAt || fresh.reversalChallanId) {
      throw inventoryError('CHALLAN_ALREADY_REVERSED', 'Challan has already been reversed');
    }
    const Invoice = require('../models/Invoice');
    const Dispatch = require('../models/Dispatch');
    const dependentInvoice = await Invoice.findOne({ sourceDocType: 'Challan', sourceDocId: fresh._id, status: { $nin: ['cancelled', 'Cancelled'] } }).session(session).lean();
    if (dependentInvoice) throw inventoryError('CHALLAN_HAS_INVOICE', `Cancel draft invoice ${dependentInvoice.invoiceNo} before reversing this Challan`);
    const dependentDispatch = await Dispatch.findOne({ challanId: fresh._id, status: { $nin: ['cancelled'] } }).session(session).lean();
    if (dependentDispatch) throw inventoryError('CHALLAN_HAS_DISPATCH', `Cancel dispatch ${dependentDispatch.dispatchNo} before reversing this Challan`);

    const sourceWarehouse = await Warehouse.findById(fresh.warehouseId).session(session);
    const isTransfer = ['transfer', 'production_transfer'].includes(fresh.challanType);
    const destinationWarehouse = isTransfer ? await Warehouse.findById(fresh.destinationWarehouseId).session(session) : null;
    if (!sourceWarehouse || (isTransfer && !destinationWarehouse)) throw inventoryError('WAREHOUSE_NOT_FOUND', 'Warehouse referenced by Challan no longer exists');

    const reversalItems = [];
    for (const item of fresh.items) {
      const qty = Number(item.qty || 0);
      if (!item.productId || qty <= 0) throw inventoryError('INVALID_QUANTITY', 'Invalid Challan line during reversal');
      const filter = entryFilter(sourceWarehouse._id, item);
      const source = await InventoryEntry.findOne(filter).session(session);
      if (!source) throw inventoryError('REVERSAL_STOCK_SLOT_NOT_FOUND', `Stock slot not found for ${item.name}`);
      source.qtyBoxes += qty;
      await source.save({ session });
      reversalItems.push({ item, sourceQty: source.qtyBoxes });

      if (isTransfer) {
        const destFilter = entryFilter(destinationWarehouse._id, item);
        const dest = await InventoryEntry.findOne({ ...destFilter, qtyBoxes: { $gte: qty } }).session(session);
        if (!dest) throw inventoryError('REVERSAL_DESTINATION_STOCK_MISSING', `Destination stock is insufficient to reverse ${item.name}`);
        dest.qtyBoxes -= qty;
        await dest.save({ session });
      }
    }

    // Sale reversal restores the aggregate product stock; internal transfers remain aggregate-neutral.
    if (!isTransfer) {
      const byProduct = new Map();
      for (const item of fresh.items) byProduct.set(String(item.productId), (byProduct.get(String(item.productId)) || 0) + Number(item.qty || 0));
      for (const [productId, qty] of byProduct) await Product.updateOne({ _id: productId }, { $inc: { stockLevel: qty } }, { session });
    }

    const ledgerWrites = [];
    for (const { item, sourceQty } of reversalItems) {
      ledgerWrites.push({ productId: item.productId, warehouseId: sourceWarehouse._id, warehouseName: sourceWarehouse.name, type: 'IN', qtyBoxes: Number(item.qty), balanceBoxes: sourceQty, reference: fresh.challanNo, note: `REVERSAL of ${fresh.challanType.toUpperCase()} Challan ${fresh.challanNo}`, createdBy: options.createdBy || 'System', packing: item.packing || 1, vendorId: item.vendorId || '', vendorName: item.vendorName || '', batchNo: item.batchNo || '', movementKey: `${fresh._id}:REV:IN:${sourceWarehouse._id}:${item.productId}:${item.batchNo || ''}:${item.packing || 1}:${item.vendorId || ''}` });
      if (isTransfer) {
        const dest = await InventoryEntry.findOne(entryFilter(destinationWarehouse._id, item)).session(session);
        ledgerWrites.push({ productId: item.productId, warehouseId: destinationWarehouse._id, warehouseName: destinationWarehouse.name, type: 'OUT', qtyBoxes: -Number(item.qty), balanceBoxes: dest.qtyBoxes, reference: fresh.challanNo, note: `REVERSAL of ${fresh.challanType.toUpperCase()} Challan ${fresh.challanNo}`, createdBy: options.createdBy || 'System', packing: item.packing || 1, vendorId: item.vendorId || '', vendorName: item.vendorName || '', batchNo: item.batchNo || '', movementKey: `${fresh._id}:REV:OUT:${destinationWarehouse._id}:${item.productId}:${item.batchNo || ''}:${item.packing || 1}:${item.vendorId || ''}` });
      }
    }
    await StockLedger.insertMany(ledgerWrites, { session, ordered: true });
    fresh.inventoryPostingStatus = 'reversed';
    fresh.inventoryReversedAt = new Date();
    fresh.inventoryReversedBy = options.userId || null;
    fresh.status = 'cancelled';
    await fresh.save({ session });
    if (fresh.salesOrderId) {
      const Order = require('../models/Order');
      const order = await Order.findById(fresh.salesOrderId).session(session);
      if (order && order.status !== 'cancelled') {
        const remainingPosted = await Challan.find({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' }).session(session).lean();
        for (const oi of order.items) {
          const fulfilled = remainingPosted.flatMap(c => c.items || []).filter(it => String(it.productId) === String(oi.productId)).reduce((sum, it) => sum + Number(it.qty || 0), 0);
          oi.fulfilledQty = fulfilled;
          oi.backorderedQty = Math.max(0, Number(oi.qty || 0) + Number(oi.freeQty || 0) - fulfilled);
        }
        const done = order.items.every(i => Number(i.backorderedQty || 0) <= 0);
        const any = order.items.some(i => Number(i.fulfilledQty || 0) > 0);
        order.status = done ? 'fulfilled' : (any ? 'partially_fulfilled' : 'processing');
        await order.save({ session });
      }
    }
    return fresh;
  });
}



/**
 * Atomically completes the finished-goods portion of a production batch:
 * receives finished goods into the production-house warehouse, creates the
 * destination transfer Challan, and persists the completed batch. The Challan
 * remains draft, so the subsequent physical transfer is controlled by its posting.
 */
async function completeProductionReceiptAndCreateTransfer({ batch, challanItems, productionWarehouse, destinationWarehouse, challanNo, now, userId, createdBy, backfillIngredients = [], backfillWarehouseId = null }) {
  return withTransaction(async (session) => {
    const BatchProduction = require('../models/BatchProduction');
    const Challan = require('../models/Challan');
    const Product = require('../models/Product');
    const freshBatch = await BatchProduction.findById(batch._id).session(session);
    if (!freshBatch) throw inventoryError('BATCH_NOT_FOUND', 'Production batch not found');
    if (freshBatch.status === 'completed') {
      if (freshBatch.productionTransferChallanId) return { batch: freshBatch, challan: await Challan.findById(freshBatch.productionTransferChallanId).session(session) };
      throw inventoryError('BATCH_ALREADY_COMPLETED', 'Production batch is already completed');
    }

    // Copy the validated in-memory state first. Any late raw-material consumption
    // below then becomes part of this same transaction and cannot be overwritten.
    const snapshot = batch.toObject ? batch.toObject() : batch;
    const protectedFields = new Set(['_id', 'createdAt', 'updatedAt', 'firmId', 'batchNo']);
    for (const [key, value] of Object.entries(snapshot)) if (!protectedFields.has(key)) freshBatch.set(key, value);

    if (backfillIngredients.length > 0) {
      if (!backfillWarehouseId) throw inventoryError('MANUFACTURING_WAREHOUSE_REQUIRED', 'Manufacturing warehouse is required for raw-material backfill');
      for (const ingredient of backfillIngredients) {
        const qtyNeeded = ingredient.itemType === 'packaging'
          ? Number(((ingredient.qtyRequired || 0) * Number(freshBatch.actualYieldQty || 0)).toFixed(2))
          : Number(((ingredient.qtyRequired || 0) * (Number(freshBatch.plannedQty || 0) / 100)).toFixed(2));
        if (qtyNeeded <= 0) continue;

        const entries = await RawMaterialEntry.find({
          rawMaterialId: ingredient.rawMaterialId,
          warehouseId: backfillWarehouseId,
          qcStatus: 'approved',
          qty: { $gt: 0 }
        }).sort({ expiryDate: 1, createdAt: 1 }).session(session);
        let remaining = qtyNeeded;
        for (const entry of entries) {
          if (remaining <= 0.0001) break;
          const deduct = Math.min(remaining, Math.round(Number(entry.qty || 0) * 100) / 100);
          if (deduct <= 0) continue;
          const updated = await RawMaterialEntry.findOneAndUpdate(
            { _id: entry._id, qty: { $gte: deduct } },
            { $inc: { qty: -deduct } },
            { new: true, session }
          );
          if (!updated) throw inventoryError('RAW_MATERIAL_CONCURRENCY_CONFLICT', `Raw-material batch ${entry.batchNo} changed while completing production`);
          freshBatch.rawMaterialCost = Number(freshBatch.rawMaterialCost || 0) + deduct * Number(entry.purchaseRate || 0);
          freshBatch.ingredientsConsumed.push({
            rawMaterialId: ingredient.rawMaterialId,
            rawMaterialEntryId: entry._id,
            qtyConsumed: deduct,
            batchNo: entry.batchNo
          });
          remaining = Number((remaining - deduct).toFixed(2));
        }
        if (remaining > 0.0001) {
          throw inventoryError('INSUFFICIENT_RAW_MATERIAL', `Insufficient approved stock to backfill material ${ingredient.rawMaterialId}; short by ${remaining}`);
        }
      }
    }

    const production = await Warehouse.findById(productionWarehouse._id).session(session);
    const destination = await Warehouse.findById(destinationWarehouse._id).session(session);
    if (!production || !destination) throw inventoryError('WAREHOUSE_NOT_FOUND', 'Production or destination warehouse not found');

    const products = await Product.find({ _id: { $in: challanItems.map(item => item.productId) } }).session(session);
    const productMap = new Map(products.map(product => [String(product._id), product]));
    const totalCost = Number(freshBatch.rawMaterialCost || 0) + Number(freshBatch.overheadCost || 0) + Number(freshBatch.jobWorkCharges || 0);
    const totalWeight = challanItems.reduce((sum, item) => {
      const product = productMap.get(String(item.productId));
      return sum + Number(item.qty || 0) * Number(product?.mrp || product?.price || 1);
    }, 0);
    const adjustedChallanItems = challanItems.map(item => {
      const product = productMap.get(String(item.productId));
      if (!product) throw inventoryError('PRODUCT_NOT_FOUND', `Product not found: ${item.productId}`);
      const weight = Number(item.qty || 0) * Number(product.mrp || product.price || 1);
      const share = totalWeight > 0 ? weight / totalWeight : 1 / Math.max(challanItems.length, 1);
      const rate = Number(item.qty || 0) > 0 ? (totalCost * share) / Number(item.qty) : 0;
      return { ...item, rate: Number(rate.toFixed(2)) };
    });
    freshBatch.unitProductionCost = Number(freshBatch.actualYieldQty || 0) > 0
      ? Number((totalCost / Number(freshBatch.actualYieldQty)).toFixed(2))
      : 0;
    const notesPrefix = String(freshBatch.qcNotes || '').split('\n\nPackaging Split Inward:')[0];
    const splitSummary = adjustedChallanItems.map(item => `${item.name}: ${item.qty} units (@ ₹${item.rate}/unit)`).join('\n');
    freshBatch.qcNotes = `${notesPrefix ? `${notesPrefix}\n\n` : ''}Packaging Split Inward:\n${splitSummary}`;

    for (const item of adjustedChallanItems) {
      const product = productMap.get(String(item.productId));
      if (!product) throw inventoryError('PRODUCT_NOT_FOUND', `Product not found: ${item.productId}`);
      const filter = entryFilter(production._id, { ...item, vendorId: '', packing: item.packing || 1, batchNo: item.batchNo || '' });
      let entry = await InventoryEntry.findOne(filter).session(session);
      if (!entry) {
        entry = new InventoryEntry({ warehouseId: production._id, warehouseName: production.name, productId: product._id, productType: product.productType || '', size: product.size || '', colour: product.colour || '', shape: product.shape || '', weight: product.weight || '', hsnCode: product.hsnCode || '', vendorId: '', vendorName: 'In-House Production', qtyBoxes: 0, packing: item.packing || 1, batchNo: item.batchNo || '', mfgDate: item.mfgDate || now, expiryDate: item.expiryDate || undefined, purchaseRate: item.rate || 0, manufacturingUnitId: item.manufacturingUnitId, manufacturingUnitName: item.manufacturingUnitName || '', qcStatus: 'approved' });
      }
      entry.qtyBoxes += Number(item.qty);
      entry.qcStatus = 'approved';
      await entry.save({ session });
      await StockLedger.create([{
        productId: product._id, warehouseId: production._id, warehouseName: production.name, type: 'IN', qtyBoxes: Number(item.qty), balanceBoxes: entry.qtyBoxes, reference: batch.batchNo, note: `Production completed — Batch ${batch.batchNo} received at production house`, createdBy: createdBy || 'System', packing: item.packing || 1, batchNo: item.batchNo || '', mfgDate: item.mfgDate || now, expiryDate: item.expiryDate || undefined, manufacturingUnitId: item.manufacturingUnitId, manufacturingUnitName: item.manufacturingUnitName || '', movementKey: `BATCH_PRODUCTION_IN:${batch._id}:${item.productId}:${item.batchNo || ''}:${item.packing || 1}`
      }], { session });
      await Product.updateOne({ _id: product._id }, { $inc: { stockLevel: Number(item.qty) } }, { session });
    }

    const challan = await Challan.create([{
      challanNo,
      date: now,
      challanType: 'production_transfer',
      warehouseId: production._id,
      warehouseName: production.name,
      destinationWarehouseId: destination._id,
      destinationWarehouseName: destination.name,
      sourceManufacturingUnitId: batch.manufacturingUnitId,
      sourceManufacturingUnitName: batch.manufacturingUnitName,
      partyName: destination.name,
      partyAddress: destination.addressLine1 || '',
      partyCity: destination.city || '',
      shippingAddress: [destination.addressLine1, destination.city, destination.state, destination.pincode].filter(Boolean).join(', '),
      items: adjustedChallanItems,
      status: 'draft',
      inventoryPostingStatus: 'not_posted',
      mode: 'regular',
      baseAmount: 0,
      nettTotal: 0,
      deductInventory: true
    }], { session });

    freshBatch.productionTransferChallanId = challan[0]._id;
    freshBatch.productionTransferChallanNo = challan[0].challanNo;
    freshBatch.productionStockPostedAt = now;
    freshBatch.productionStockPostedBy = userId || null;
    freshBatch.productionStockTransactionId = new mongoose.Types.ObjectId().toString();
    await freshBatch.save({ session });
    return { batch: freshBatch, challan: challan[0] };
  });
}

module.exports = { postChallanInventory, reverseChallanInventory, completeProductionReceiptAndCreateTransfer, inventoryError };
