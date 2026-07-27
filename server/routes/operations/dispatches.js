const express = require('express');
const router = express.Router();
const Dispatch = require('../../models/Dispatch');
const InventoryEntry = require('../../models/InventoryEntry');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

async function nextDispatchNo() {
  const last = await Dispatch.findOne().sort({ createdAt: -1 }).select('dispatchNo');
  if (!last || !last.dispatchNo) return 'DSP-001';
  const num = parseInt(last.dispatchNo.replace(/\D/g, ''), 10) || 0;
  return `DSP-${String(num + 1).padStart(3, '0')}`;
}

// GET all dispatches
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { customerName: new RegExp(search, 'i') },
      { dispatchNo: new RegExp(search, 'i') },
      { invoiceNo: new RegExp(search, 'i') },
      { lrNo: new RegExp(search, 'i') },
      { trackingId: new RegExp(search, 'i') },
    ];
    const dispatches = await Dispatch.find(filter).sort({ createdAt: -1 });
    res.json(dispatches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create dispatch
router.post('/', validate(schemas.dispatchSchema), async (req, res) => {
  try {
    const dispatchNo = await nextDispatchNo();
    const dispatch = await Dispatch.create({ ...req.body, dispatchNo });
    if (req.io) {
      req.io.emit('dispatch_updated', { type: 'created', id: dispatch._id });
    }
    res.status(201).json(dispatch);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update status / tracking
router.patch('/:id', validate(schemas.dispatchSchema.partial()), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.status === 'delivered' && !data.deliveredAt) data.deliveredAt = new Date();
    const dispatch = await Dispatch.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (req.io) {
      req.io.emit('dispatch_updated', { type: 'updated', id: dispatch._id });
    }
    res.json(dispatch);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Dispatch.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET dead stock report — products with no stock movement in 90 days
router.get('/dead-stock', async (req, res) => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    // Get all inventory entries with qtyBoxes > 0
    const entries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } })
      .populate('productId', 'name sku price size')
      .populate('warehouseId', 'name')
      .lean();

    // Find entries where no stock movement happened since cutoff
    const StockLedger = require('../../models/StockLedger');
    const deadStock = [];

    for (const entry of entries) {
      const lastMovement = await StockLedger.findOne({
        productId: entry.productId?._id || entry.productId,
        warehouseId: entry.warehouseId?._id || entry.warehouseId,
      }).sort({ date: -1 }).select('date');

      const lastDate = lastMovement?.date || entry.updatedAt || entry.createdAt;
      if (new Date(lastDate) < cutoff) {
        deadStock.push({
          productId: entry.productId?._id || entry.productId,
          productName: entry.productId?.name || 'Unknown',
          productSku: entry.productId?.sku || '',
          price: entry.productId?.price || 0,
          size: entry.productId?.size || '',
          warehouseId: entry.warehouseId?._id || entry.warehouseId,
          warehouseName: entry.warehouseId?.name || 'Default',
          qtyBoxes: entry.qtyBoxes,
          stockValue: entry.qtyBoxes * (entry.productId?.price || 0),
          lastMovementDate: lastDate,
          daysSinceMovement: Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000),
        });
      }
    }

    deadStock.sort((a, b) => b.daysSinceMovement - a.daysSinceMovement);
    res.json(deadStock);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
