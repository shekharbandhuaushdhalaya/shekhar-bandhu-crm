const express = require('express');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const RawMaterialLedger = require('../../models/RawMaterialLedger');
const Warehouse = require('../../models/Warehouse');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/requiredIdempotency');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const router = express.Router();
const { withTransaction } = require('../../utils/withTransaction');
const { logAction } = require('../../utils/auditLogger');
const { getFirmId } = require('../../utils/tenantContext');

const { getBotanicalInfo, resolveHerbDetails } = require('../../utils/botanicalLookup');

async function resolveRawMaterialWarehouse({ warehouseId, manufacturingUnitId, session } = {}) {
  if (warehouseId) {
    const warehouse = await Warehouse.findById(warehouseId).session(session || null);
    if (!warehouse) { const e = new Error('Warehouse not found'); e.code = 'WAREHOUSE_NOT_FOUND'; throw e; }
    return warehouse;
  }
  if (manufacturingUnitId) {
    const warehouse = await Warehouse.findOne({ manufacturingUnitId, type: 'manufacturing' }).session(session || null);
    if (!warehouse) { const e = new Error('No manufacturing warehouse is mapped to this manufacturing unit'); e.code = 'MANUFACTURING_WAREHOUSE_NOT_MAPPED'; throw e; }
    return warehouse;
  }
  const manufacturing = await Warehouse.find({ type: 'manufacturing' }).sort({ isDefault: -1, createdAt: 1 }).limit(2).session(session || null);
  if (manufacturing.length === 1) return manufacturing[0];
  const defaults = await Warehouse.find({ isDefault: true }).limit(2).session(session || null);
  if (defaults.length === 1) return defaults[0];
  const e = new Error('warehouseId is required because the firm has more than one possible raw-material warehouse');
  e.code = 'WAREHOUSE_REQUIRED';
  throw e;
}


// GET /api/raw-materials/herb-service/lookup & GET /api/raw-materials/botanical-lookup
router.get(['/botanical-lookup', '/herb-service/lookup'], authorize('manufacturing:view'), async (req, res) => {
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
router.post('/herb-service/resolve', authorize('manufacturing:view'), async (req, res) => {
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
router.get('/', authorize('manufacturing:view'), async (req, res) => {
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

    const rawMaterialFields = 'name sku unit materialType packagingType materialGrade specification category isScheduleE1 minReorder cleaningLossPercent botanicalName acceptedScientificName family genus species botanicalAuthority taxonomicRank taxonomicStatus botanicalSynonyms commonNames taxonomySource taxonomyVerifiedAt therapeuticUses rasa virya vipaka guna dosage botanicalDescription partUsed pharmacopoeialStandard monographRef createdAt updatedAt';
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
router.post('/', authorize('manufacturing:create'), validate(schemas.rawMaterialSchema), async (req, res) => {
  try {
    const { name, unit, minReorder, category, materialType } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const formattedName = name.trim().replace(/\s+/g, ' ').toUpperCase();
    const resolvedUnit = unit || 'kg';
    const resolvedMaterialType = materialType || (category === 'Packaging' || category === 'Packaging Material' ? 'packaging' : (category === 'Excipient' ? 'excipient' : 'raw_material'));
    const resolvedCategory = category || (resolvedMaterialType === 'packaging' ? 'Packaging' : resolvedMaterialType === 'excipient' ? 'Excipient' : 'Herb');

    // Auto-populate botanical/scientific details if missing
    let botanicalName = req.body.botanicalName;
    let botanicalProfile = null;
    let partUsed = req.body.partUsed;
    let pharmacopoeialStandard = req.body.pharmacopoeialStandard;

    if (!botanicalName || !botanicalName.trim()) {
      const autoBotanical = await resolveHerbDetails(formattedName);
      botanicalProfile = autoBotanical;
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
      materialType: resolvedMaterialType,
      packagingType: req.body.packagingType || '',
      materialGrade: req.body.materialGrade || '',
      specification: req.body.specification || '',
      botanicalName: botanicalName || '',
      partUsed: partUsed || '',
      pharmacopoeialStandard: pharmacopoeialStandard || 'API',
      acceptedScientificName: req.body.acceptedScientificName || (botanicalProfile && botanicalProfile.acceptedScientificName) || botanicalName || '',
      family: req.body.family || (botanicalProfile && botanicalProfile.family) || '',
      genus: req.body.genus || (botanicalProfile && botanicalProfile.genus) || '',
      species: req.body.species || (botanicalProfile && botanicalProfile.species) || '',
      botanicalAuthority: req.body.botanicalAuthority || (botanicalProfile && botanicalProfile.botanicalAuthority) || '',
      taxonomicRank: req.body.taxonomicRank || (botanicalProfile && botanicalProfile.taxonomicRank) || '',
      taxonomicStatus: req.body.taxonomicStatus || (botanicalProfile && botanicalProfile.taxonomicStatus) || '',
      botanicalSynonyms: req.body.botanicalSynonyms || (botanicalProfile && botanicalProfile.botanicalSynonyms) || [],
      commonNames: req.body.commonNames || (botanicalProfile && botanicalProfile.commonNames) || [],
      taxonomySource: req.body.taxonomySource || (botanicalProfile && botanicalProfile.taxonomySource) || '',
      taxonomyVerifiedAt: req.body.taxonomyVerifiedAt || (botanicalProfile && botanicalProfile.taxonomyVerifiedAt) || null,
      therapeuticUses: req.body.therapeuticUses || (botanicalProfile && botanicalProfile.therapeuticUses) || [],
      rasa: req.body.rasa || (botanicalProfile && botanicalProfile.rasa) || [],
      virya: req.body.virya || (botanicalProfile && botanicalProfile.virya) || '',
      vipaka: req.body.vipaka || (botanicalProfile && botanicalProfile.vipaka) || '',
      guna: req.body.guna || (botanicalProfile && botanicalProfile.guna) || [],
      dosage: req.body.dosage || (botanicalProfile && botanicalProfile.dosage) || '',
      botanicalDescription: req.body.botanicalDescription || (botanicalProfile && botanicalProfile.description) || ''
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
router.put('/:id', authorize('manufacturing:edit'), validate(schemas.rawMaterialSchema.partial()), async (req, res) => {
  try {
    const { name, unit, minReorder, category, materialType } = req.body;

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
      const effectiveMaterialType = materialType !== undefined ? materialType : existingRM.materialType;

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
    if (materialType !== undefined) updateFields.materialType = materialType;
    if (updateFields.materialType === 'packaging') updateFields.category = 'Packaging';

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
router.delete('/:id', authorize('manufacturing:delete'), async (req, res) => {
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
router.get('/entries', authorize('manufacturing:view'), async (req, res) => {
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
router.get('/expiry-alerts', authorize('manufacturing:view'), async (req, res) => {
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
router.post('/entries', idempotency, authorize('manufacturing:create'), validate(schemas.rawMaterialEntrySchema), async (req, res) => {
  try {
    const { rawMaterialId, batchNo, qty, purchaseRate, vendorId, vendorName, expiryDate, warehouseId, manufacturingUnitId } = req.body;
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

    const entry = await withTransaction(async session => {
      const rm = await RawMaterial.findById(rawMaterialId).session(session);
      if (!rm) throw Object.assign(new Error('Raw material definition not found'), { code: 'RAW_MATERIAL_NOT_FOUND' });
      const warehouse = await resolveRawMaterialWarehouse({ warehouseId, manufacturingUnitId, session });

      // Batch identity is warehouse-specific. Never merge stock from different physical locations.
      let current = await RawMaterialEntry.findOne({ rawMaterialId, warehouseId: warehouse._id, batchNo: batchNo.trim().toUpperCase() }).session(session);
      if (current) {
        current.initialQty = (current.initialQty || current.qty || 0) + valQty;
        current.qty += valQty;
        current.purchaseRate = valRate;
        if (expiryDate) current.expiryDate = new Date(expiryDate);
        await current.save({ session });
      } else {
        [current] = await RawMaterialEntry.create([{
          rawMaterialId,
          batchNo: batchNo.trim().toUpperCase(),
          initialQty: valQty,
          qty: valQty,
          purchaseRate: valRate,
          vendorId: vendorId || null,
          vendorName: vendorName ? vendorName.trim() : '',
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          qcStatus: 'under_test',
          expiryDate: expiryDate ? new Date(expiryDate) : null
        }], { session });
      }
      await RawMaterialLedger.create([{
        rawMaterialId: rm._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'IN',
        qty: valQty,
        balance: Number(current.qty || 0),
        batchNo: current.batchNo,
        reference: req.body.reference || '',
        note: 'Raw-material stock receipt',
        movementKey: req.headers['idempotency-key'] ? `${getFirmId() || 'firm'}:raw-entry:${req.headers['idempotency-key']}` : undefined,
        createdBy: req.user?.name || 'System',
      }], { session });
      return current;
    });

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'entry_created', id: entry._id });
    }
    await logAction({ action: 'RAW_MATERIAL_ENTRY_CREATED', description: `Received ${valQty} units of raw material batch ${batchNo}`, details: { id: entry._id, rawMaterialId, warehouseId: entry.warehouseId, qty: valQty }, req });
    res.status(201).json(entry);
  } catch (err) {
    const status = ['WAREHOUSE_NOT_FOUND','WAREHOUSE_REQUIRED','MANUFACTURING_WAREHOUSE_NOT_MAPPED','RAW_MATERIAL_NOT_FOUND'].includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
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
    await logAction({ action: 'RAW_MATERIAL_QC_STATUS_CHANGED', description: `Set raw-material batch ${entry.batchNo} QC status to ${qcStatus}`, details: { id: entry._id, qcStatus }, req });

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'qc_status_changed', id: entry._id, qcStatus });
    }

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/raw-materials/entries/:id/clean — Record cleaning/pre‑processing loss for a stock entry
router.post('/entries/:id/clean', authorize('manufacturing:edit'), validate(schemas.cleaningAdjustmentSchema), async (req, res) => {
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
    await logAction({ action: 'RAW_MATERIAL_CLEANING_RECORDED', description: `Recorded cleaning adjustment for batch ${entry.batchNo}`, details: { id: entry._id, cleanedQty: cleaned, loss, notes: notes || '' }, req });
    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'entry_cleaned', id: entry._id });
    }
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/raw-materials/entries/:id — Void/Delete a stock entry
router.delete('/entries/:id', authorize('manufacturing:delete'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required when voiding a raw-material stock entry', code: 'ADJUSTMENT_REASON_REQUIRED' });
    const existing = await RawMaterialEntry.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Stock entry not found' });
    if (Number(existing.qty || 0) > 0) return res.status(409).json({ error: 'Stock entries with remaining quantity cannot be deleted; use an approved stock adjustment first.', code: 'RAW_MATERIAL_ENTRY_HAS_STOCK' });
    const deleted = await RawMaterialEntry.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Stock entry not found' });
    await logAction({ action: 'RAW_MATERIAL_ENTRY_VOIDED', description: `Voided raw-material stock entry ${req.params.id}`, details: { id: req.params.id, reason }, req });
    res.json({ message: 'Stock entry removed successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/raw-materials/:id/genealogy — Reverse trace: which finished batches used this raw material
router.get('/:id/genealogy', authorize('manufacturing:view'), async (req, res) => {
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
router.get('/purchases/list', authorize('manufacturing:view'), async (req, res) => {
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
router.post('/purchase', idempotency, authorize('manufacturing:create'), async (req, res) => {
  try {
    const { vendorId, vendorName, date, items, warehouseId, manufacturingUnitId } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const result = await withTransaction(async session => {
      const warehouse = await resolveRawMaterialWarehouse({ warehouseId, manufacturingUnitId, session });

      // Generate purchase reference atomically for this tenant.
      const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const purchaseRef = await generateAtomicDocumentNumber(`rawMaterialPurchase_${dateStr}`, `PR-${dateStr}-`, 3, session);

      const created = [];
      for (const item of items) {
        if (!item.rawMaterialId || !item.batchNo || !(Number(item.qty) > 0)) continue;
        const [entry] = await RawMaterialEntry.create([{
          rawMaterialId: item.rawMaterialId,
          batchNo: item.batchNo.trim().toUpperCase(),
          initialQty: Number(item.qty),
          qty: Number(item.qty),
          purchaseRate: Number(item.purchaseRate) || 0,
          vendorId: vendorId || undefined,
          vendorName: vendorName || item.vendorName || '',
          expiryDate: item.expiryDate || undefined,
          purchaseRef,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          qcStatus: 'under_test',
        }], { session });
        await RawMaterialLedger.create([{
          rawMaterialId: item.rawMaterialId,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'IN',
          qty: Number(item.qty),
          balance: Number(entry.qty || 0),
          batchNo: entry.batchNo,
          reference: purchaseRef,
          note: 'Raw-material purchase receipt',
          movementKey: `${getFirmId() || 'firm'}:raw-purchase:${purchaseRef}:${created.length}`,
          createdBy: req.user?.name || 'System',
        }], { session });
        created.push(entry);
      }
      if (!created.length) throw Object.assign(new Error('At least one valid purchase item is required'), { code: 'PURCHASE_ITEMS_REQUIRED' });
      return { purchaseRef, entries: created };
    });
    await logAction({ action: 'RAW_MATERIAL_PURCHASE_CREATED', description: `Created raw-material purchase ${result.purchaseRef}`, details: { purchaseRef: result.purchaseRef, entryIds: result.entries.map(e => e._id) }, req });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/raw-materials/:id/adjust-stock — Adjust raw material stock level with audit reason
router.post('/:id/adjust-stock', idempotency, authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { newStockLevel, reason, warehouseId, manufacturingUnitId } = req.body;
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

    const result = await withTransaction(async session => {
      const rm = await RawMaterial.findById(req.params.id).session(session);
      if (!rm) throw Object.assign(new Error('Raw material not found'), { code: 'RAW_MATERIAL_NOT_FOUND' });
      const warehouse = await resolveRawMaterialWarehouse({ warehouseId, manufacturingUnitId, session });

      // Adjust one physical warehouse only; never silently rebalance stock across locations.
      const entries = await RawMaterialEntry.find({ rawMaterialId: req.params.id, warehouseId: warehouse._id }).sort({ expiryDate: 1, createdAt: 1 }).session(session);
      const currentStock = entries.reduce((s, e) => s + (e.qty || 0), 0);
      const diff = Number((targetStock - currentStock).toFixed(3));
      if (diff === 0) return { rm, currentStock, diff };

      if (diff < 0) {
        let toReduce = Math.abs(diff);
        for (const entry of entries) {
          if (toReduce <= 0.0001) break;
          if ((entry.qty || 0) <= 0) continue;
          const reduce = Math.min(toReduce, entry.qty);
          entry.qty = Number((entry.qty - reduce).toFixed(3));
          entry.cleaningNotes = `${entry.cleaningNotes ? entry.cleaningNotes + '\n' : ''}Stock Adjustment: -${reduce} units on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`;
          await entry.save({ session });
          toReduce -= reduce;
        }
        if (toReduce > 0.0001) throw Object.assign(new Error('Unable to reduce the requested quantity from available batches'), { code: 'ADJUSTMENT_EXCEEDS_STOCK' });
      } else {
        const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;
        if (latestEntry) {
          latestEntry.qty = Number((latestEntry.qty + diff).toFixed(3));
          latestEntry.initialQty = Number((latestEntry.initialQty + diff).toFixed(3));
          latestEntry.cleaningNotes = `${latestEntry.cleaningNotes ? latestEntry.cleaningNotes + '\n' : ''}Stock Adjustment: +${diff} units on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`;
          await latestEntry.save({ session });
        } else {
          await RawMaterialEntry.create([{
            rawMaterialId: rm._id,
            batchNo: `ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
            initialQty: diff,
            qty: diff,
            purchaseRate: 0,
            vendorName: 'Stock Adjustment',
            warehouseId: warehouse._id,
            warehouseName: warehouse.name,
            qcStatus: 'approved',
            cleaningNotes: `Initial adjustment on ${new Date().toLocaleDateString()} Reason: ${reason.trim()}`
          }], { session });
        }
      }
      await RawMaterialLedger.create([{
        rawMaterialId: rm._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'ADJUSTMENT',
        qty: diff,
        balance: targetStock,
        reference: `ADJ:${rm._id}`,
        note: reason.trim(),
        movementKey: `${getFirmId() || 'firm'}:raw-adjust:${req.headers['idempotency-key'] || `${rm._id}:${Date.now()}`}`,
        createdBy: req.user?.name || 'System',
      }], { session });
      return { rm, currentStock, diff };
    });

    if (req.io) {
      req.io.emit('raw_material_updated', { type: 'stock_adjusted', id: result.rm._id });
    }
    await logAction({ action: 'RAW_MATERIAL_STOCK_ADJUSTED', description: `Adjusted raw-material stock by ${result.diff} units`, details: { id: result.rm._id, warehouseId, diff: result.diff, currentStock: result.currentStock, newStock: targetStock, reason: reason.trim() }, req });
    if (result.diff === 0) return res.json({ message: 'No adjustment needed', stockLevel: result.currentStock });
    res.json({ message: 'Stock adjusted successfully', diff: result.diff, currentStock: result.currentStock, newStock: targetStock });
  } catch (err) {
    const status = ['RAW_MATERIAL_NOT_FOUND','ADJUSTMENT_EXCEEDS_STOCK'].includes(err.code) ? 409 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

module.exports = router;
