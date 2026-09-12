const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Sample = require('../../models/Sample');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const schemas = require('../../validation/schemas');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { withTransaction } = require('../../utils/withTransaction');

async function nextSampleNo() { return generateAtomicDocumentNumber('sampleNo', 'SMP', 5); }
function fail(code, message) { const e = new Error(message); e.code = code; return e; }

async function consumeWarehouseStock({ warehouse, item, sampleNo, givenTo, actor, session, lineIndex }) {
  const product = await Product.findById(item.productId).session(session);
  if (!product) throw fail('PRODUCT_NOT_FOUND', `Product not found: ${item.productName || item.productId}`);
  const qty = Number(item.qty || 0);
  if (!(qty > 0)) throw fail('INVALID_QUANTITY', `Sample quantity must be positive for ${product.name}`);
  const now = new Date();
  const filter = {
    warehouseId: warehouse._id,
    productId: product._id,
    qcStatus: 'approved',
    qtyBoxes: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }],
  };
  if (item.batchNo) filter.batchNo = item.batchNo;
  const entries = await InventoryEntry.find(filter).session(session).sort({ expiryDate: 1, createdAt: 1 });
  const available = entries.reduce((n, row) => n + Number(row.qtyBoxes || 0), 0);
  if (available + 1e-9 < qty) throw fail('INSUFFICIENT_STOCK', `${product.name}: requested ${qty}, approved non-expired stock available ${available}`);
  if (Number(product.stockLevel || 0) + 1e-9 < qty) throw fail('AGGREGATE_STOCK_MISMATCH', `${product.name}: aggregate stock is lower than warehouse stock allocation`);

  let remaining = qty;
  const batches = [];
  for (let i = 0; i < entries.length && remaining > 1e-9; i += 1) {
    const entry = entries[i];
    const take = Math.min(remaining, Number(entry.qtyBoxes || 0));
    if (!(take > 0)) continue;
    entry.qtyBoxes = Number(entry.qtyBoxes || 0) - take;
    await entry.save({ session });
    await StockLedger.create([{
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'OUT',
      qtyBoxes: -take,
      balanceBoxes: entry.qtyBoxes,
      reference: sampleNo,
      movementKey: `sample:${sampleNo}:${lineIndex}:${entry._id}`,
      note: `Sample distribution to ${givenTo}`,
      createdBy: actor?.name || 'System',
      packing: entry.packing || 1,
      batchNo: entry.batchNo || '',
    }], { session });
    batches.push({ batchNo: entry.batchNo || '', qty: take });
    remaining -= take;
  }
  product.stockLevel = Number(product.stockLevel || 0) - qty;
  await product.save({ session });
  return { product, batches };
}

router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { givenTo: new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { sampleNo: new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { location: new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    ];
    res.json(await Sample.find(filter).sort({ createdAt: -1 }).lean());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authorize('inventory:create'), validate(schemas.sampleSchema), async (req, res) => {
  try {
    const result = await withTransaction(async session => {
      const warehouse = req.body.warehouseId
        ? await Warehouse.findById(req.body.warehouseId).session(session)
        : await Warehouse.findOne({ isDefault: true }).session(session);
      if (!warehouse) throw fail('WAREHOUSE_REQUIRED', 'Select a warehouse for sample distribution');
      const sampleNo = await nextSampleNo();
      const totalMrpValue = (req.body.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.mrp || 0), 0);
      const persistedItems = [];
      for (let idx = 0; idx < req.body.items.length; idx += 1) {
        const item = req.body.items[idx];
        const consumed = await consumeWarehouseStock({ warehouse, item, sampleNo, givenTo: req.body.givenTo, actor: req.user, session, lineIndex: idx });
        // Preserve an explicitly selected batch. FEFO allocations across multiple batches remain
        // auditable in StockLedger even when the summary item cannot represent every lot.
        persistedItems.push({ ...item, productName: item.productName || consumed.product.name, batchNo: item.batchNo || (consumed.batches.length === 1 ? consumed.batches[0].batchNo : '') });
      }
      const [sample] = await Sample.create([{
        ...req.body,
        items: persistedItems,
        warehouseId: warehouse._id,
        sampleNo,
        totalMrpValue,
        inventoryPostedAt: new Date(),
        inventoryPostedBy: mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null,
      }], { session });
      return sample;
    });
    if (req.io) req.io.emit('sample_updated', { type: 'created', id: result._id });
    res.status(201).json(result);
  } catch (e) { res.status(400).json({ error: e.message, code: e.code || 'SAMPLE_CREATE_FAILED' }); }
});

router.patch('/:id', authorize('inventory:edit'), async (req, res) => {
  try {
    const allowed = {};
    for (const key of ['status', 'followUpDate', 'notes']) if (Object.prototype.hasOwnProperty.call(req.body, key)) allowed[key] = req.body[key];
    const sample = await Sample.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!sample) return res.status(404).json({ error: 'Sample not found' });
    if (req.io) req.io.emit('sample_updated', { type: 'updated', id: sample._id });
    res.json(sample);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', authorize('inventory:delete'), async (_req, res) => {
  res.status(409).json({ error: 'Posted sample distributions are immutable. Record a controlled inventory correction instead of deleting physical-history documents.', code: 'SAMPLE_IMMUTABLE' });
});

module.exports = router;
