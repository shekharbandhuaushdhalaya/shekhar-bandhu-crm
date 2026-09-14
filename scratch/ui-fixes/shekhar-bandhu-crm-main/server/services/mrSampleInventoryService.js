const MrSampleBag = require('../models/MrSampleBag');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const { withTransaction } = require('../utils/withTransaction');

function sampleError(code, message) { const e = new Error(message); e.code = code; return e; }

async function resolveSourceWarehouse(warehouseId, session) {
  if (warehouseId) {
    const w = await Warehouse.findById(warehouseId).session(session);
    if (!w) throw sampleError('WAREHOUSE_NOT_FOUND', 'Sample source warehouse not found');
    return w;
  }
  const defaults = await Warehouse.find({ isDefault: true, type: { $ne: 'dealer_consignment' } }).session(session).limit(2);
  if (defaults.length !== 1) {
    throw sampleError('SAMPLE_WAREHOUSE_REQUIRED', 'Select a source warehouse for MR sample allocation');
  }
  return defaults[0];
}

async function issueSamplesToMr({ mrId, items, warehouseId = null, actorId = null, actorName = 'System' }) {
  return withTransaction(async session => {
    const warehouse = await resolveSourceWarehouse(warehouseId, session);
    const results = [];
    for (let idx = 0; idx < (items || []).length; idx += 1) {
      const requested = items[idx];
      const qty = Number(requested.qty || 0);
      if (!requested.productId || !(qty > 0)) continue;
      const product = await Product.findById(requested.productId).session(session);
      if (!product) throw sampleError('PRODUCT_NOT_FOUND', 'Sample product not found');
      const now = new Date();
      const filter = {
        warehouseId: warehouse._id, productId: product._id, qcStatus: 'approved', qtyBoxes: { $gt: 0 },
        $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }],
      };
      if (requested.batchNo) filter.batchNo = requested.batchNo;
      const entries = await InventoryEntry.find(filter).session(session).sort({ expiryDate: 1, createdAt: 1 });
      const available = entries.reduce((sum, e) => sum + Number(e.qtyBoxes || 0), 0);
      if (available + 1e-9 < qty) throw sampleError('INSUFFICIENT_SAMPLE_STOCK', `${product.name}: requested ${qty}, approved stock available ${available}`);
      if (Number(product.stockLevel || 0) + 1e-9 < qty) throw sampleError('AGGREGATE_STOCK_MISMATCH', `${product.name}: aggregate stock is lower than warehouse sample allocation`);

      let remaining = qty;
      for (const entry of entries) {
        if (remaining <= 1e-9) break;
        const take = Math.min(remaining, Number(entry.qtyBoxes || 0));
        if (!(take > 0)) continue;
        entry.qtyBoxes = Number(entry.qtyBoxes || 0) - take;
        await entry.save({ session });
        let bag = await MrSampleBag.findOne({ mrId, productId: product._id, batchNo: entry.batchNo || '' }).session(session);
        if (!bag) bag = new MrSampleBag({ mrId, productId: product._id, batchNo: entry.batchNo || '', qty: 0 });
        bag.qty = Number(bag.qty || 0) + take;
        bag.expiryDate = entry.expiryDate || bag.expiryDate || null;
        bag.allocatedBy = actorId || null;
        bag.allocatedAt = new Date();
        await bag.save({ session });
        await StockLedger.create([{
          productId: product._id, warehouseId: warehouse._id, warehouseName: warehouse.name,
          type: 'OUT', qtyBoxes: -take, balanceBoxes: entry.qtyBoxes,
          reference: `MR-SAMPLE:${mrId}`, movementKey: `mr-sample:${mrId}:${product._id}:${entry._id}:${Date.now()}:${idx}`,
          note: `Sample transfer to MR field bag`, createdBy: actorName,
          packing: entry.packing || 1, batchNo: entry.batchNo || '',
        }], { session });
        results.push(bag);
        remaining -= take;
      }
      product.stockLevel = Number(product.stockLevel || 0) - qty;
      await product.save({ session });
    }
    return { warehouse, items: results };
  });
}

async function consumeSamplesFromMr({ mrId, sampleDetails, session }) {
  for (const sample of sampleDetails || []) {
    const qty = Number(sample.qty || 0);
    if (!sample.productId || !(qty > 0)) continue;
    const now = new Date();
    const filter = { mrId, productId: sample.productId, qty: { $gt: 0 }, $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }] };
    if (sample.batchNo) filter.batchNo = sample.batchNo;
    const bags = await MrSampleBag.find(filter).session(session).sort({ expiryDate: 1, createdAt: 1 });
    const available = bags.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    if (available + 1e-9 < qty) throw sampleError('INSUFFICIENT_MR_SAMPLE_STOCK', `${sample.name || 'Sample'}: MR bag has ${available}, requested ${qty}`);
    let remaining = qty;
    for (const bag of bags) {
      if (remaining <= 1e-9) break;
      const take = Math.min(remaining, Number(bag.qty || 0));
      bag.qty = Number(bag.qty || 0) - take;
      await bag.save({ session });
      remaining -= take;
    }
  }
}

module.exports = { issueSamplesToMr, consumeSamplesFromMr };
