const mongoose = require('mongoose');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
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
    batchNo: item.batchNo || ''
  };
  return filter;
}

async function getOrCreateDestinationEntry({ warehouse, item, product, session }) {
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
    mfgDate: item.mfgDate || undefined,
    expiryDate: item.expiryDate || undefined,
    purchaseRate: item.rate || item.purchaseRate || 0,
    manufacturingUnitId: item.manufacturingUnitId || undefined,
    manufacturingUnitName: item.manufacturingUnitName || ''
  });
  return entry;
}

async function postChallanInventory(challan, options = {}) {
  const actor = options.createdBy || 'System';

  return withTransaction(async (session) => {
    const Challan = require('../models/Challan');
    const fresh = await Challan.findById(challan._id).session(session);
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
      const sourceEntry = await InventoryEntry.findOneAndUpdate(
        { ...filter, qtyBoxes: { $gte: qty } },
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
        const destinationEntry = await getOrCreateDestinationEntry({ warehouse: destinationWarehouse, item, product, session });
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

    const reversalId = new mongoose.Types.ObjectId().toString();
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
    return fresh;
  });
}



/**
 * Atomically completes the finished-goods portion of a production batch:
 * receives finished goods into the production-house warehouse, creates the
 * destination transfer Challan, and persists the completed batch. The Challan
 * remains draft, so the subsequent physical transfer is controlled by its posting.
 */
async function completeProductionReceiptAndCreateTransfer({ batch, challanItems, productionWarehouse, destinationWarehouse, challanNo, now, userId, createdBy }) {
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

    const production = await Warehouse.findById(productionWarehouse._id).session(session);
    const destination = await Warehouse.findById(destinationWarehouse._id).session(session);
    if (!production || !destination) throw inventoryError('WAREHOUSE_NOT_FOUND', 'Production or destination warehouse not found');

    for (const item of challanItems) {
      const product = await Product.findById(item.productId).session(session);
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
      items: challanItems,
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
    // Copy the already-validated in-memory batch state into the transaction.
    const snapshot = batch.toObject ? batch.toObject() : batch;
    const protectedFields = new Set(['_id', 'createdAt', 'updatedAt', 'firmId', 'batchNo']);
    for (const [key, value] of Object.entries(snapshot)) if (!protectedFields.has(key)) freshBatch.set(key, value);
    await freshBatch.save({ session });
    return { batch: freshBatch, challan: challan[0] };
  });
}

module.exports = { postChallanInventory, reverseChallanInventory, completeProductionReceiptAndCreateTransfer, inventoryError };
