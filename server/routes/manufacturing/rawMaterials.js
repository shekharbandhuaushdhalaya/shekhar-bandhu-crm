const express = require('express');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const router = express.Router();

const { getBotanicalInfo, resolveHerbDetails } = require('../../utils/botanicalLookup');

// GET /api/raw-materials/herb-service/lookup & GET /api/raw-materials/botanical-lookup
router.get(['/botanical-lookup', '/herb-service/lookup'], async (req, res) => {
  try {
    const name = req.query.name || req.query.q || req.query.query;
    if (!name) return res.status(400).json({ error: 'Herb name query parameter is required' });
    const info = await resolveHerbDetails(name);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/herb-service/resolve — API Service to resolve herb scientific name & metadata
router.post('/herb-service/resolve', async (req, res) => {
  try {
    const name = req.body.name || req.body.herbName || req.body.query;
    if (!name) return res.status(400).json({ error: 'Herb name is required in request body' });
    const info = await resolveHerbDetails(name);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials — List raw materials with optional pagination & filtering
router.get('/', async (req, res) => {
  try {
    const { warehouseId, simple, search, page, limit } = req.query;
    const filter = search ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { botanicalName: { $regex: search, $options: 'i' } },
      ]
    } : {};

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    const rawMaterialFields = 'name sku unit category isScheduleE1 minReorder cleaningLossPercent botanicalName partUsed pharmacopoeialStandard monographRef createdAt updatedAt';
    let query = RawMaterial.find(filter).select(rawMaterialFields).sort({ name: 1 });
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const rawMaterials = await query.lean();

    if (simple === 'true') {
      if (isPaginated) {
        const total = await RawMaterial.countDocuments(filter);
        return res.json({
          data: rawMaterials,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        });
      }
      return res.json(rawMaterials);
    }

    // Enrich with aggregated live stock level, blocked qty, and available qty using MongoDB aggregation
    const matchStage = {};
    if (warehouseId && warehouseId !== 'all') {
      matchStage.warehouseId = warehouseId;
    }
    const pipeline = [
      {
        $group: {
          _id: '$rawMaterialId',
          totalQty: { $sum: '$qty' },
          totalReserved: { $sum: { $ifNull: ['$reservedQty', 0] } }
        }
      }
    ];
    if (Object.keys(matchStage).length > 0) {
      pipeline.unshift({ $match: matchStage });
    }
    const stockAgg = await RawMaterialEntry.aggregate(pipeline);
    const stockMap = {};
    stockAgg.forEach(s => {
      const stockLevel = Number((s.totalQty || 0).toFixed(2));
      const blockedQty = Number((s.totalReserved || 0).toFixed(2));
      const availableQty = Math.max(0, Number((stockLevel - blockedQty).toFixed(2)));
      stockMap[s._id.toString()] = { stockLevel, blockedQty, availableQty };
    });

    const enriched = rawMaterials.map(rm => {
      const data = stockMap[rm._id.toString()] || { stockLevel: 0, blockedQty: 0, availableQty: 0 };
      return {
        ...rm,
        stockLevel: data.stockLevel,
        blockedQty: data.blockedQty,
        availableQty: data.availableQty
      };
    });

    if (isPaginated) {
      const total = await RawMaterial.countDocuments(filter);
      return res.json({
        data: enriched,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials — Create raw material definition
router.post('/', validate(schemas.rawMaterialSchema), async (req, res) => {
  try {
    const { name, unit, minReorder, category } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const formattedName = name.trim().replace(/\s+/g, ' ').toUpperCase();
    const resolvedUnit = unit || 'kg';
    const resolvedCategory = category || 'Herb';

    // Auto-populate botanical/scientific details if missing
    let botanicalName = req.body.botanicalName;
    let partUsed = req.body.partUsed;
    let pharmacopoeialStandard = req.body.pharmacopoeialStandard;

    if (!botanicalName || !botanicalName.trim()) {
      const autoBotanical = await getBotanicalInfo(formattedName);
      if (autoBotanical.botanicalName) {
        botanicalName = autoBotanical.botanicalName;
        if (!partUsed) partUsed = autoBotanical.partUsed;
        if (!pharmacopoeialStandard) pharmacopoeialStandard = autoBotanical.pharmacopoeialStandard;
      }
    }

    // Application-level duplicate check (case- and whitespace-insensitive name + unit + category)
    const duplicate = await RawMaterial.findDuplicateByName(formattedName, {
      unit: resolvedUnit,
      category: resolvedCategory
    });

    if (duplicate) {
      return res.status(409).json({
        error: `Raw material "${duplicate.name}" with unit "${duplicate.unit}" and category "${duplicate.category}" already exists (SKU: ${duplicate.sku}).`,
        existingId: duplicate._id,
        existingSku: duplicate.sku,
        existingName: duplicate.name,
        existingUnit: duplicate.unit,
        existingCategory: duplicate.category
      });
    }

    const { generateRawMaterialSku } = require('../../utils/skuGenerator');
    let computedSku = generateRawMaterialSku(formattedName);
    let skuConflict = await RawMaterial.findOne({ sku: computedSku }).lean();
    let counter = 1;
    while (skuConflict) {
      computedSku = `${generateRawMaterialSku(formattedName)}-${counter}`;
      skuConflict = await RawMaterial.findOne({ sku: computedSku }).lean();
      counter++;
    }

    const newRM = await RawMaterial.create({
      ...req.body,
      name: formattedName,
      sku: computedSku,
      unit: resolvedUnit,
      minReorder: Number(minReorder) || 0,
      category: resolvedCategory,
      botanicalName: botanicalName || '',
      partUsed: partUsed || '',
      pharmacopoeialStandard: pharmacopoeialStandard || 'API'
    });

    res.status(201).json(newRM);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'A raw material with the same name, unit, and category already exists.',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/raw-materials/:id — Update raw material definition
router.put('/:id', validate(schemas.rawMaterialSchema.partial()), async (req, res) => {
  try {
    const { name, unit, minReorder, category } = req.body;

    const existingRM = await RawMaterial.findById(req.params.id);
    if (!existingRM) return res.status(404).json({ error: 'Raw material not found' });

    let formattedName = existingRM.name;
    if (name !== undefined) {
      formattedName = name.trim().replace(/\s+/g, ' ').toUpperCase();
    }

    if (name !== undefined || unit !== undefined || category !== undefined) {
      const effectiveName = formattedName;
      const effectiveUnit = unit !== undefined ? unit : existingRM.unit;
      const effectiveCategory = category !== undefined ? category : existingRM.category;

      const duplicate = await RawMaterial.findDuplicateByName(effectiveName, {
        unit: effectiveUnit,
        category: effectiveCategory,
        excludeId: req.params.id
      });

      if (duplicate) {
        return res.status(409).json({
          error: `Another raw material "${duplicate.name}" with unit "${duplicate.unit}" and category "${duplicate.category}" already exists (SKU: ${duplicate.sku}).`,
          existingId: duplicate._id,
          existingSku: duplicate.sku,
          existingName: duplicate.name,
          existingUnit: duplicate.unit,
          existingCategory: duplicate.category
        });
      }
    }

    const updateFields = { ...req.body };
    if (name !== undefined) {
      updateFields.name = formattedName;
      const { generateRawMaterialSku } = require('../../utils/skuGenerator');
      let computedSku = generateRawMaterialSku(name);
      let skuConflict = await RawMaterial.findOne({ sku: computedSku, _id: { $ne: req.params.id } }).lean();
      let counter = 1;
      while (skuConflict) {
        computedSku = `${generateRawMaterialSku(name)}-${counter}`;
        skuConflict = await RawMaterial.findOne({ sku: computedSku, _id: { $ne: req.params.id } }).lean();
        counter++;
      }
      updateFields.sku = computedSku;
    }
    if (unit !== undefined) updateFields.unit = unit;
    if (minReorder !== undefined) updateFields.minReorder = Number(minReorder) || 0;
    if (category !== undefined) updateFields.category = category;

    const updated = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'A raw material with the same name, unit, and category already exists.',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/raw-materials/:id — Delete raw material definition
router.delete('/:id', async (req, res) => {
  try {
    const rawMaterial = await RawMaterial.findById(req.params.id);
    if (!rawMaterial) return res.status(404).json({ error: 'Raw material not found' });

    // Aggregate remaining stock quantity across all stock entries for this raw material
    const mongoose = require('mongoose');
    const stockAgg = await RawMaterialEntry.aggregate([
      { $match: { rawMaterialId: new mongoose.Types.ObjectId(req.params.id) } },
      { $group: { _id: null, totalQty: { $sum: '$qty' } } }
    ]);
    const currentStock = stockAgg.length > 0 ? Number((stockAgg[0].totalQty || 0).toFixed(2)) : 0;

    // Safety rule: Raw material cannot be deleted if stock quantity > 0
    if (currentStock > 0) {
      return res.status(400).json({
        error: `Cannot delete raw material "${rawMaterial.name}". Remaining stock quantity is ${currentStock} ${rawMaterial.unit}. Stock must be 0 before deletion.`
      });
    }

    // Clean up historical zero-qty entry records and delete the raw material master
    await RawMaterialEntry.deleteMany({ rawMaterialId: req.params.id, qty: { $lte: 0 } });
    const deleted = await RawMaterial.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Raw material not found' });

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Raw material deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials/entries — List all raw material stock entries (batches)
router.get('/entries', async (req, res) => {
  try {
    const entries = await RawMaterialEntry.find({})
      .populate('rawMaterialId', 'name sku unit category')
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
    .populate('rawMaterialId', 'name sku unit category')
    .sort({ expiryDate: 1 })
    .lean();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/entries — Inward a batch of raw material (Raw material stock entry)
router.post('/entries', validate(schemas.rawMaterialEntrySchema), async (req, res) => {
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
      entry.initialQty = (entry.initialQty || entry.qty || 0) + valQty;
      entry.qty += valQty;
      entry.purchaseRate = valRate; // overwrite rate or average it
      if (expiryDate) entry.expiryDate = new Date(expiryDate);
      await entry.save();
    } else {
      entry = await RawMaterialEntry.create({
        rawMaterialId,
        batchNo: batchNo.trim().toUpperCase(),
        initialQty: valQty,
        qty: valQty,
        purchaseRate: valRate,
        vendorId: vendorId || null,
        vendorName: vendorName ? vendorName.trim() : '',
        expiryDate: expiryDate ? new Date(expiryDate) : null
      });
    }

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'entry_created', id: entry._id });
    }
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/raw-materials/entries/:id/qc-status — Quality control approval for raw material stock entries
router.patch('/entries/:id/qc-status', authorize('manufacturing:qcApprove'), async (req, res) => {
  try {
    const { qcStatus } = req.body;
    if (!['under_test', 'approved', 'rejected'].includes(qcStatus)) {
      return res.status(400).json({ error: 'qcStatus must be under_test, approved, or rejected' });
    }

    const entry = await RawMaterialEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Raw material entry not found' });

    entry.qcStatus = qcStatus;
    await entry.save();

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'qc_status_changed', id: entry._id, qcStatus });
    }

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/entries/:id/clean — Record cleaning/pre‑processing loss for a stock entry
router.post('/entries/:id/clean', validate(schemas.cleaningAdjustmentSchema), async (req, res) => {
  try {
    const entryId = req.params.id;
    const { cleanedQty, notes } = req.body;
    const entry = await RawMaterialEntry.findById(entryId);
    if (!entry) return res.status(404).json({ error: 'Stock entry not found' });

    const originalQty = entry.qty;
    const cleaned = Number(cleanedQty);
    if (isNaN(cleaned) || cleaned < 0) {
      return res.status(400).json({ error: 'cleanedQty must be a non‑negative number' });
    }
    if (cleaned > originalQty) {
      return res.status(400).json({ error: 'cleanedQty cannot exceed current quantity' });
    }

    const loss = originalQty - cleaned;
    const lossPercent = originalQty > 0 ? (loss / originalQty) * 100 : 0;

    entry.cleanedQty = cleaned;
    entry.cleaningLoss = loss;
    entry.cleaningLossPercent = Number(lossPercent.toFixed(2));
    entry.cleaningDate = new Date();
    entry.cleaningNotes = notes || '';
    entry.qty = cleaned; // update usable qty

    await entry.save();
    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'entry_cleaned', id: entry._id });
    }
    res.json(entry);
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

// GET /api/raw-materials/:id/genealogy — Reverse trace: which finished batches used this raw material
router.get('/:id/genealogy', async (req, res) => {
  try {
    const rawMaterial = await RawMaterial.findById(req.params.id);
    if (!rawMaterial) return res.status(404).json({ error: 'Raw material not found' });

    const BatchProduction = require('../../models/BatchProduction');
    const batches = await BatchProduction.find({
      'ingredientsConsumed.rawMaterialId': req.params.id
    })
      .populate('productId', 'name sku')
      .sort({ createdAt: -1 })
      .lean();

    const consumptions = batches.map(batch => {
      const relevant = batch.ingredientsConsumed.filter(
        ing => ing.rawMaterialId && ing.rawMaterialId.toString() === req.params.id
      );
      const totalConsumed = relevant.reduce((sum, ing) => sum + (ing.qtyConsumed || 0), 0);
      return {
        batchProductionId: batch._id,
        batchNo: batch.batchNo,
        productName: batch.productId ? batch.productId.name : 'Unknown',
        productSku: batch.productId ? batch.productId.sku : '',
        status: batch.status,
        totalConsumed,
        unit: rawMaterial.unit,
        startDate: batch.startDate,
        endDate: batch.endDate,
        plannedQty: batch.plannedQty,
        actualYieldQty: batch.actualYieldQty || 0,
        wasteQty: batch.wasteQty || 0,
        variancePercent: batch.variancePercent || 0
      };
    });

    res.json({
      rawMaterial: {
        _id: rawMaterial._id,
        name: rawMaterial.name,
        sku: rawMaterial.sku,
        unit: rawMaterial.unit,
        category: rawMaterial.category
      },
      totalBatchesUsedIn: consumptions.length,
      batches: consumptions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials/purchases — List purchases grouped by purchaseRef
router.get('/purchases/list', async (req, res) => {
  try {
    const entries = await RawMaterialEntry.find({ purchaseRef: { $ne: '' } })
      .populate('rawMaterialId', 'name sku unit category')
      .populate('vendorId', 'name company')
      .sort({ createdAt: -1 })
      .lean();

    const groups = {};
    entries.forEach(e => {
      const ref = e.purchaseRef;
      if (!groups[ref]) {
        groups[ref] = { purchaseRef: ref, createdAt: e.createdAt, items: [], vendors: new Set() };
      }
      groups[ref].items.push(e);
      if (e.vendorName) groups[ref].vendors.add(e.vendorName);
    });

    const result = Object.values(groups).map((g) => ({
      ...g,
      vendors: Array.from(g.vendors),
      itemCount: g.items.length,
      totalQty: g.items.reduce((s, i) => s + (i.qty || 0), 0),
      totalCost: g.items.reduce((s, i) => s + ((i.qty || 0) * (i.purchaseRate || 0)), 0),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/purchase — Create a bulk purchase (creates RawMaterialEntry records)
router.post('/purchase', async (req, res) => {
  try {
    const { vendorId, vendorName, date, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Generate purchase reference
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await RawMaterialEntry.countDocuments({ purchaseRef: { $regex: `^PR-${dateStr}` } });
    const purchaseRef = `PR-${dateStr}-${String(count + 1).padStart(3, '0')}`;

    const created = [];
    for (const item of items) {
      if (!item.rawMaterialId || !item.batchNo || !item.qty) {
        continue;
      }
      const entry = await RawMaterialEntry.create({
        rawMaterialId: item.rawMaterialId,
        batchNo: item.batchNo.trim().toUpperCase(),
        initialQty: Number(item.qty),
        qty: Number(item.qty),
        purchaseRate: Number(item.purchaseRate) || 0,
        vendorId: vendorId || undefined,
        vendorName: vendorName || item.vendorName || '',
        expiryDate: item.expiryDate || undefined,
        purchaseRef,
      });
      created.push(entry);
    }

    res.status(201).json({ purchaseRef, entries: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/raw-materials/:id/adjust-stock — Adjust raw material stock level with audit reason
router.post('/:id/adjust-stock', async (req, res) => {
  try {
    const { newStockLevel, reason } = req.body;
    if (newStockLevel === undefined || newStockLevel === null) {
      return res.status(400).json({ error: 'New stock level is required' });
    }
    const targetStock = Number(newStockLevel);
    if (isNaN(targetStock) || targetStock < 0) {
      return res.status(400).json({ error: 'New stock level must be a non-negative number' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for adjustment is required' });
    }

    const rm = await RawMaterial.findById(req.params.id);
    if (!rm) return res.status(404).json({ error: 'Raw material not found' });

    // Calculate current stock level
    const entries = await RawMaterialEntry.find({ rawMaterialId: req.params.id });
    const currentStock = entries.reduce((s, e) => s + (e.qty || 0), 0);
    const diff = Number((targetStock - currentStock).toFixed(3));

    if (diff === 0) {
      return res.json({ message: 'No adjustment needed', stockLevel: currentStock });
    }

    if (diff < 0) {
      // Reduce stock (FIFO)
      entries.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
        if (a.expiryDate && !b.expiryDate) return -1;
        if (!a.expiryDate && b.expiryDate) return 1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      let toReduce = Math.abs(diff);
      for (const entry of entries) {
        if (toReduce <= 0.0001) break;
        if ((entry.qty || 0) <= 0) continue;
        const reduce = Math.min(toReduce, entry.qty);
        entry.qty = Number((entry.qty - reduce).toFixed(3));
        entry.cleaningNotes = `${entry.cleaningNotes ? entry.cleaningNotes + '\n' : ''}Stock Adjustment: -${reduce} units on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`;
        await entry.save();
        toReduce -= reduce;
      }
    } else {
      // Increase stock
      const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
      if (latestEntry) {
        latestEntry.qty = Number((latestEntry.qty + diff).toFixed(3));
        latestEntry.initialQty = Number((latestEntry.initialQty + diff).toFixed(3));
        latestEntry.cleaningNotes = `${latestEntry.cleaningNotes ? latestEntry.cleaningNotes + '\n' : ''}Stock Adjustment: +${diff} units on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`;
        await latestEntry.save();
      } else {
        await RawMaterialEntry.create({
          rawMaterialId: rm._id,
          batchNo: `ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
          initialQty: diff,
          qty: diff,
          purchaseRate: 0,
          vendorName: 'Stock Adjustment',
          cleaningNotes: `Initial adjustment on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`
        });
      }
    }

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'stock_adjusted', id: rm._id });
    }

    res.json({ message: 'Stock adjusted successfully', diff, currentStock, newStock: targetStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
