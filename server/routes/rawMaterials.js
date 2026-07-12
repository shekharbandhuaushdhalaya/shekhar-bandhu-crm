const express = require('express');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const router = express.Router();

// GET /api/raw-materials — List all raw materials
router.get('/', async (req, res) => {
  try {
    const rawMaterials = await RawMaterial.find({}).sort({ name: 1 }).lean();
    
    // Enrich with aggregated live stock level
    const entries = await RawMaterialEntry.find({}).lean();
    const stockMap = {};
    entries.forEach(e => {
      const rId = e.rawMaterialId.toString();
      stockMap[rId] = (stockMap[rId] || 0) + (e.qty || 0);
    });

    const enriched = rawMaterials.map(rm => ({
      ...rm,
      stockLevel: stockMap[rm._id.toString()] || 0
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials — Create raw material definition
router.post('/', async (req, res) => {
  try {
    const { name, sku, unit, minReorder } = req.body;
    if (!name || !sku) {
      return res.status(400).json({ error: 'Name and SKU are required' });
    }

    const existing = await RawMaterial.findOne({ sku });
    if (existing) {
      return res.status(400).json({ error: `Raw material with SKU ${sku} already exists` });
    }

    const newRM = await RawMaterial.create({
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      unit: unit || 'kg',
      minReorder: Number(minReorder) || 0
    });

    res.status(201).json(newRM);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/raw-materials/:id — Update raw material definition
router.put('/:id', async (req, res) => {
  try {
    const { name, sku, unit, minReorder } = req.body;
    const updateFields = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (sku !== undefined) updateFields.sku = sku.trim().toUpperCase();
    if (unit !== undefined) updateFields.unit = unit;
    if (minReorder !== undefined) updateFields.minReorder = Number(minReorder) || 0;

    const updated = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Raw material not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/raw-materials/:id — Delete raw material definition
router.delete('/:id', async (req, res) => {
  try {
    // Check if there are any stock entries
    const entries = await RawMaterialEntry.countDocuments({ rawMaterialId: req.params.id });
    if (entries > 0) {
      return res.status(400).json({ error: 'Cannot delete raw material with active stock entries' });
    }
    const deleted = await RawMaterial.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Raw material not found' });
    res.json({ message: 'Raw material deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials/entries — List all raw material stock entries (batches)
router.get('/entries', async (req, res) => {
  try {
    const entries = await RawMaterialEntry.find({})
      .populate('rawMaterialId', 'name sku unit')
      .sort({ createdAt: -1 })
      .lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials/expiry-alerts — Get near-expiry raw materials
router.get('/expiry-alerts', async (req, res) => {
  try {
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const alerts = await RawMaterialEntry.find({
      qty: { $gt: 0 },
      expiryDate: { $ne: null, $lte: ninetyDays }
    })
    .populate('rawMaterialId', 'name sku unit')
    .sort({ expiryDate: 1 })
    .lean();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/entries — Inward a batch of raw material (Raw material stock entry)
router.post('/entries', async (req, res) => {
  try {
    const { rawMaterialId, batchNo, qty, purchaseRate, vendorId, vendorName, expiryDate } = req.body;
    if (!rawMaterialId || !batchNo || qty === undefined || purchaseRate === undefined) {
      return res.status(400).json({ error: 'Missing required stock inward fields' });
    }

    const valQty = Number(qty);
    const valRate = Number(purchaseRate);
    if (isNaN(valQty) || valQty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number' });
    }
    if (isNaN(valRate) || valRate < 0) {
      return res.status(400).json({ error: 'Purchase rate must be a non-negative number' });
    }

    const rm = await RawMaterial.findById(rawMaterialId);
    if (!rm) return res.status(404).json({ error: 'Raw material definition not found' });

    // Check if raw material batch already exists to avoid conflict, update if exists or error
    let entry = await RawMaterialEntry.findOne({ rawMaterialId, batchNo });
    if (entry) {
      // Add to existing quantity
      entry.qty += valQty;
      entry.purchaseRate = valRate; // overwrite rate or average it
      if (expiryDate) entry.expiryDate = new Date(expiryDate);
      await entry.save();
    } else {
      entry = await RawMaterialEntry.create({
        rawMaterialId,
        batchNo: batchNo.trim().toUpperCase(),
        qty: valQty,
        purchaseRate: valRate,
        vendorId: vendorId || null,
        vendorName: vendorName ? vendorName.trim() : '',
        expiryDate: expiryDate ? new Date(expiryDate) : null
      });
    }

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/raw-materials/entries/:id — Void/Delete a stock entry
router.delete('/entries/:id', async (req, res) => {
  try {
    const deleted = await RawMaterialEntry.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Stock entry not found' });
    res.json({ message: 'Stock entry removed successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
