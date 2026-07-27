const express = require('express');
const router = express.Router();
const Sample = require('../../models/Sample');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

async function nextSampleNo() {
  const last = await Sample.findOne().sort({ createdAt: -1 }).select('sampleNo');
  if (!last || !last.sampleNo) return 'SMP-001';
  const num = parseInt(last.sampleNo.replace(/\D/g, ''), 10) || 0;
  return `SMP-${String(num + 1).padStart(3, '0')}`;
}

async function deductSampleInventory(sample, warehouseId) {
  if (!sample.items?.length || !warehouseId) return;
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) return;

  for (const item of sample.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const boxes = item.qty || 0;

    product.stockLevel = Math.max(0, product.stockLevel - boxes);
    await product.save();

    const entry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: product._id,
    });
    if (entry) {
      entry.qtyBoxes = Math.max(0, entry.qtyBoxes - boxes);
      await entry.save();
    }

    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'OUT',
      qtyBoxes: -boxes,
      balanceBoxes: entry ? entry.qtyBoxes : 0,
      reference: sample.sampleNo,
      note: `Sample distribution to ${sample.givenTo}`,
      createdBy: sample.givenBy || 'System',
      batchNo: item.batchNo || '',
    });
  }
}

// GET all
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { givenTo: new RegExp(search, 'i') },
      { sampleNo: new RegExp(search, 'i') },
      { location: new RegExp(search, 'i') },
    ];
    const samples = await Sample.find(filter).sort({ createdAt: -1 });
    res.json(samples);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create
router.post('/', validate(schemas.sampleSchema), async (req, res) => {
  try {
    const sampleNo = await nextSampleNo();
    const totalMrpValue = (req.body.items || []).reduce((s, item) => s + (item.qty || 0) * (item.mrp || 0), 0);
    const sample = await Sample.create({ ...req.body, sampleNo, totalMrpValue });

    // Deduct inventory from primary warehouse
    const warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    if (warehouse) {
      await deductSampleInventory(sample, warehouse._id);
    }

    if (req.io) {
      req.io.emit('sample_updated', { type: 'created', id: sample._id });
    }
    res.status(201).json(sample);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update status
router.patch('/:id', validate(schemas.sampleSchema.partial()), async (req, res) => {
  try {
    const sample = await Sample.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!sample) return res.status(404).json({ error: 'Sample not found' });
    if (req.io) {
      req.io.emit('sample_updated', { type: 'updated', id: sample._id });
    }
    res.json(sample);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Sample.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
