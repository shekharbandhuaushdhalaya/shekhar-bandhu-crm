const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const BillOfMaterials = require('../../models/BillOfMaterials');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/batch-productions — List all batch production runs
router.get('/', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const batches = await BatchProduction.find({})
      .populate('productId', 'name sku size packing')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .sort({ createdAt: -1 })
      .lean();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions — Start a new batch production run
router.post('/', validate(schemas.batchProductionSchema), async (req, res) => {
  try {
    const { productId, plannedQty, batchNo, manufacturingUnitId } = req.body;
    if (!productId || !plannedQty || !batchNo || !manufacturingUnitId) {
      return res.status(400).json({ error: 'Product ID, planned quantity, batch number, and manufacturing unit ID are required' });
    }

    const valPlanned = Number(plannedQty);
    if (isNaN(valPlanned) || valPlanned <= 0) {
      return res.status(400).json({ error: 'Planned quantity must be a positive number' });
    }

    const ManufacturingUnit = require('../../models/ManufacturingUnit');
    const mfgUnit = await ManufacturingUnit.findById(manufacturingUnitId);
    if (!mfgUnit) return res.status(404).json({ error: 'Manufacturing unit not found' });

    const existingBatch = await BatchProduction.findOne({ batchNo: batchNo.trim().toUpperCase() });
    if (existingBatch) {
      return res.status(400).json({ error: `Production batch number ${batchNo} already exists` });
    }

    const prod = await Product.findById(productId);
    if (!prod) return res.status(404).json({ error: 'Finished product not found' });

    const bom = await BillOfMaterials.findOne({ productId });
    if (!bom) {
      return res.status(400).json({ error: `No Bill of Materials configured for product: ${prod.name}` });
    }

    const ingredientsRequired = [];
    for (const ing of bom.ingredients) {
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      const isPackaging = ing.itemType === 'packaging' || (rm && rm.category === 'Packaging');
      if (!isPackaging) {
        const scaleBase = bom.batchYieldSize && bom.batchYieldSize > 0 ? bom.batchYieldSize : 100;
        const scale = valPlanned / scaleBase;
        const qtyNeeded = ing.qtyRequired * scale;
        ingredientsRequired.push({ rawMaterialId: ing.rawMaterialId, qtyNeeded });
      }
    }

    const verifiedDeductions = [];
    for (const reqIng of ingredientsRequired) {
      const rm = await RawMaterial.findById(reqIng.rawMaterialId);
      const entries = await RawMaterialEntry.find({ rawMaterialId: reqIng.rawMaterialId });

      entries.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        }
        if (a.expiryDate && !b.expiryDate) return -1;
        if (!a.expiryDate && b.expiryDate) return 1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      const totalAvailable = entries.reduce((acc, e) => acc + (e.qty || 0), 0);
      if (totalAvailable < reqIng.qtyNeeded) {
        return res.status(400).json({
          error: `Insufficient stock for raw material: ${rm.name}. Needed: ${reqIng.qtyNeeded.toFixed(2)} ${rm.unit}, Available: ${totalAvailable.toFixed(2)} ${rm.unit}`
        });
      }

      let needed = reqIng.qtyNeeded;
      for (const entry of entries) {
        if (needed <= 0) break;
        if ((entry.qty || 0) <= 0) continue;
        const deduct = Math.min(needed, entry.qty);
        verifiedDeductions.push({ entry, deductQty: deduct, rawMaterialId: reqIng.rawMaterialId });
        needed -= deduct;
      }
    }

    const ingredientsConsumed = [];
    let rawMaterialCost = 0;
    for (const dec of verifiedDeductions) {
      const { entry, deductQty, rawMaterialId } = dec;
      entry.qty = Math.max(0, entry.qty - deductQty);
      await entry.save();
      rawMaterialCost += deductQty * (entry.purchaseRate || 0);
      ingredientsConsumed.push({
        rawMaterialId,
        rawMaterialEntryId: entry._id,
        qtyConsumed: deductQty,
        batchNo: entry.batchNo
      });
    }

    // Scaled overhead calculation based on yield size
    const scale = valPlanned / bom.batchYieldSize;
    const computedOverhead = (bom.overheadCost || 0) * scale;

    // Configure Custom Stages or fallback to default manufacturing stages
    const customStages = bom.stages && bom.stages.length > 0
      ? bom.stages
      : [
          { name: 'Raw Material Verification & Weighing', targetDurationDays: 1 },
          { name: 'Primary Processing (Swasan/Mardan)', targetDurationDays: 1 },
          { name: 'Mixing & Blending', targetDurationDays: 1 },
          { name: 'Forming (Vati/Gutika)', targetDurationDays: 1 },
          { name: 'Drying', targetDurationDays: 1 },
          { name: 'QC Testing', targetDurationDays: 1 },
          { name: 'Packaging & Labeling', targetDurationDays: 1 }
        ];

    const batchStages = customStages.map((st, i) => {
      const startedAt = i === 0 ? new Date() : null;
      const targetDurationDays = st.targetDurationDays || 1;
      let targetCompletionDate = null;
      if (startedAt) {
        targetCompletionDate = new Date(startedAt.getTime() + targetDurationDays * 24 * 60 * 60 * 1000);
      }
      return {
        name: st.name,
        targetDurationDays,
        status: i === 0 ? 'in_progress' : 'pending',
        startedAt,
        targetCompletionDate
      };
    });

    const newBatch = await BatchProduction.create({
      batchNo: batchNo.trim().toUpperCase(),
      productId,
      manufacturingUnitId,
      manufacturingUnitName: mfgUnit.name,
      plannedQty: valPlanned,
      status: 'in_progress',
      stages: batchStages,
      ingredientsConsumed,
      rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
      overheadCost: Number(computedOverhead.toFixed(2)),
      startDate: new Date()
    });

    if (req.io) {
      req.io.emit('mfg_batch_created', newBatch);
      req.io.emit('inventory_updated', { type: 'raw_material_deduction', batchNo: newBatch.batchNo });
    }

    res.status(201).json(newBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/stage/:stageIndex — Advance a manufacturing stage
router.patch('/:id/stage/:stageIndex', async (req, res) => {
  try {
    const { status, notes, completedBy } = req.body;
    const stageIndex = parseInt(req.params.stageIndex, 10);

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot update stages on a cancelled batch' });
    }
    if (batch.status === 'completed') {
      return res.status(400).json({ error: 'Cannot update stages on a completed batch' });
    }

    if (stageIndex < 0 || stageIndex >= batch.stages.length) {
      return res.status(400).json({ error: 'Invalid stage index' });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid stage status' });
    }

    const currentStage = batch.stages[stageIndex];
    const newStatus = status || 'completed';

    if (newStatus === 'in_progress') {
      currentStage.startedAt = currentStage.startedAt || new Date();
    }
    if (newStatus === 'completed' || newStatus === 'skipped' || newStatus === 'failed') {
      currentStage.completedAt = new Date();
      currentStage.completedBy = completedBy || '';
    }
    if (notes !== undefined) {
      currentStage.notes = notes;
    }
    currentStage.status = newStatus;

    if (newStatus === 'failed') {
      // If any stage fails, the entire batch run fails immediately
      batch.status = 'rejected';
      batch.qcStatus = 'rejected';
      batch.actualYieldQty = 0;
      batch.wasteQty = batch.plannedQty;
      batch.variancePercent = -100;
      batch.endDate = new Date();
      batch.qcNotes = `Batch failed at stage [${currentStage.name}]${notes ? ` — Reason: ${notes}` : ''}. QC Inspector / Operator: ${completedBy || 'Operator'}`;
    } else if ((newStatus === 'completed' || newStatus === 'skipped') && stageIndex + 1 < batch.stages.length) {
      const nextStage = batch.stages[stageIndex + 1];
      if (nextStage.status === 'pending') {
        nextStage.status = 'in_progress';
        const started = new Date();
        nextStage.startedAt = started;
        const duration = nextStage.targetDurationDays || 1;
        nextStage.targetCompletionDate = new Date(started.getTime() + duration * 24 * 60 * 60 * 1000);
      }
    }

    // Auto-deduct packaging materials (bottles, caps, labels) when advancing past packaging stage
    const isPackagingStage = (currentStage.name || '').toLowerCase().includes('packag') || (currentStage.name || '').toLowerCase().includes('label');
    if (isPackagingStage && (newStatus === 'completed' || newStatus === 'skipped')) {
      await deductPackagingMaterials(batch, batch.plannedQty);
    }

    const allDone = batch.stages.every(s => s.status === 'completed' || s.status === 'skipped');
    if (allDone && batch.status === 'in_progress') {
      batch.status = 'qc_hold';
    }

    await batch.save();
    if (req.io) {
      req.io.emit('mfg_stage_updated', batch);
      if (batch.status === 'qc_hold') {
        req.io.emit('qc_hold_alert', { batchNo: batch.batchNo, productId: batch.productId });
      }
    }
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Auto-deduct packaging materials (bottles, labels, boxes) when reaching packaging stage or completion
async function deductPackagingMaterials(batch, outputQty) {
  if (batch.packagingDeducted) return;

  const BillOfMaterials = require('../../models/BillOfMaterials');
  const RawMaterial = require('../../models/RawMaterial');
  const RawMaterialEntry = require('../../models/RawMaterialEntry');

  const bom = await BillOfMaterials.findOne({ productId: batch.productId });
  if (!bom) {
    batch.packagingDeducted = true;
    return;
  }

  const pkgIngs = bom.ingredients.filter(ing => {
    const isExplicitPkg = ing.itemType === 'packaging';
    return isExplicitPkg;
  });

  // Also include any raw materials that have category === 'Packaging'
  for (const ing of bom.ingredients) {
    if (ing.itemType !== 'packaging') {
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      if (rm && rm.category === 'Packaging' && !pkgIngs.some(p => p.rawMaterialId.toString() === ing.rawMaterialId.toString())) {
        pkgIngs.push(ing);
      }
    }
  }

  if (!pkgIngs || pkgIngs.length === 0) {
    batch.packagingDeducted = true;
    return;
  }

  const scaleBase = bom.batchYieldSize && bom.batchYieldSize > 0 ? bom.batchYieldSize : 100;
  const scale = outputQty / scaleBase;

  for (const ing of pkgIngs) {
    const qtyNeeded = ing.qtyRequired * scale;
    const rm = await RawMaterial.findById(ing.rawMaterialId);
    if (!rm) continue;

    const entries = await RawMaterialEntry.find({ rawMaterialId: ing.rawMaterialId });
    entries.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
      if (a.expiryDate && !b.expiryDate) return -1;
      if (!a.expiryDate && b.expiryDate) return 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    let needed = qtyNeeded;
    for (const entry of entries) {
      if (needed <= 0) break;
      if ((entry.qty || 0) <= 0) continue;
      const deduct = Math.min(needed, entry.qty);
      entry.qty = Math.max(0, entry.qty - deduct);
      await entry.save();

      batch.rawMaterialCost += deduct * (entry.purchaseRate || 0);
      batch.ingredientsConsumed.push({
        rawMaterialId: ing.rawMaterialId,
        rawMaterialEntryId: entry._id,
        qtyConsumed: deduct,
        batchNo: entry.batchNo
      });
      needed -= deduct;
    }
  }

  batch.packagingDeducted = true;
}

// PATCH /api/batch-productions/:id/complete — Complete batch, record QC and inward finished stock
router.patch('/:id/complete', validate(schemas.batchCompleteSchema), async (req, res) => {
  try {
    const { 
      actualYieldQty, 
      wasteQty, 
      wasteReason, 
      qcNotes, 
      qcPassedBy, 
      packing, 
      yields,
      qcStatus,
      organoleptic,
      moistureContent,
      ashValue,
      pHValue,
      disintegrationTime,
      heavyMetals,
      microbialLimit,
      labReportRef,
      warehouseId
    } = req.body;

    if (actualYieldQty === undefined || !qcPassedBy) {
      return res.status(400).json({ error: 'Actual yield quantity and QC inspector name are required' });
    }

    const valYield = Number(actualYieldQty);
    if (isNaN(valYield) || valYield < 0) {
      return res.status(400).json({ error: 'Actual yield must be a positive number' });
    }

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed' || batch.status === 'rejected') {
      return res.status(400).json({ error: 'Batch is already completed or rejected' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled batch' });
    }

    // Ensure packaging materials are deducted if not already deducted during stage advance
    if (!batch.packagingDeducted) {
      await deductPackagingMaterials(batch, valYield);
    }

    const allDone = batch.stages.every(s => s.status === 'completed' || s.status === 'skipped');
    if (!allDone) {
      const pending = batch.stages.filter(s => s.status === 'pending' || s.status === 'in_progress').map(s => s.name);
      return res.status(400).json({ error: `Cannot complete batch. Pending stages: ${pending.join(', ')}` });
    }

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Finished goods storage warehouse was not found.' });
    }

    // Save QC parameters
    batch.qcStatus = qcStatus || 'approved';
    batch.qcParameters = {
      organoleptic: organoleptic || '',
      moistureContent: moistureContent !== undefined ? moistureContent : null,
      ashValue: ashValue !== undefined ? ashValue : null,
      pHValue: pHValue !== undefined ? pHValue : null,
      disintegrationTime: disintegrationTime !== undefined ? disintegrationTime : null,
      heavyMetals: heavyMetals || '',
      microbialLimit: microbialLimit || '',
      labReportRef: labReportRef || ''
    };

    const totalCost = batch.rawMaterialCost + (batch.overheadCost || 0);

    if (qcStatus === 'rejected') {
      // Rejection logic: No stock added, full planned quantity is waste
      batch.actualYieldQty = 0;
      batch.wasteQty = batch.plannedQty;
      batch.wasteReason = wasteReason || 'Failed Quality Control (QC) specifications';
      batch.variancePercent = -100;
      batch.unitProductionCost = 0;
      batch.qcNotes = `${qcNotes ? qcNotes.trim() + '\n\n' : ''}BATCH REJECTED by QC Inspector: ${qcPassedBy.trim()}. QC Parameters failed specifications.`;
      batch.qcPassedBy = qcPassedBy.trim();
      batch.status = 'rejected';
      batch.endDate = new Date();

      const qcStage = batch.stages.find(s => s.name.toLowerCase().includes('qc'));
      if (qcStage && qcStage.status !== 'completed') {
        qcStage.status = 'completed';
        qcStage.completedAt = new Date();
        qcStage.completedBy = qcPassedBy.trim();
        qcStage.notes = 'QC Failed - Batch Rejected';
      }
      const packagingStage = batch.stages.find(s => s.name.toLowerCase().includes('packaging') || s.name.toLowerCase().includes('label'));
      if (packagingStage && packagingStage.status !== 'completed') {
        packagingStage.status = 'skipped';
        packagingStage.completedAt = new Date();
        packagingStage.completedBy = qcPassedBy.trim();
        packagingStage.notes = 'Skipped due to QC failure';
      }

      await batch.save();
      return res.json(batch);
    }

    // Build the yields list (split or main single product)
    const yieldsList = yields && Array.isArray(yields) && yields.length > 0 ? yields : [{
      productId: batch.productId.toString(),
      actualYieldQty: valYield,
      packing: packing || 1
    }];

    // Fetch products
    const productIds = yieldsList.map(y => y.productId);
    const Product = require('../../models/Product');
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    // Validate products exist
    for (const y of yieldsList) {
      if (!productMap[y.productId]) {
        return res.status(404).json({ error: `Yield product not found: ${y.productId}` });
      }
      const yQty = Number(y.actualYieldQty);
      if (isNaN(yQty) || yQty < 0) {
        return res.status(400).json({ error: 'Yield quantity must be a non-negative number' });
      }
    }

    // Compute cost allocation weight for each yield item
    let totalAllocWeight = 0;
    const yieldItemsWithWeight = yieldsList.map(y => {
      const p = productMap[y.productId];
      const val = p.mrp || p.price || 1;
      const allocWeight = Number(y.actualYieldQty) * val;
      totalAllocWeight += allocWeight;
      return {
        ...y,
        allocWeight,
        product: p
      };
    });

    const createdEntries = [];
    const StockLedger = require('../../models/StockLedger');
    const InventoryEntry = require('../../models/InventoryEntry');

    for (const item of yieldItemsWithWeight) {
      const pct = totalAllocWeight > 0 ? (item.allocWeight / totalAllocWeight) : (1 / yieldItemsWithWeight.length);
      const allocatedCost = totalCost * pct;
      const unitCost = item.actualYieldQty > 0 ? (allocatedCost / Number(item.actualYieldQty)) : 0;

      const actualQty = Number(item.actualYieldQty);
      const packingSize = 1; // Tracked in Pcs
      const boxes = actualQty; // 1 box = 1 pc in unified Pcs tracking

      let finEntry = await InventoryEntry.findOne({
        warehouseId: warehouse._id,
        productId: item.productId,
        batchNo: batch.batchNo
      });

      if (finEntry) {
        finEntry.qtyBoxes += actualQty;
        if (batch.manufacturingUnitName && !finEntry.manufacturingUnitName) {
          finEntry.manufacturingUnitId = batch.manufacturingUnitId;
          finEntry.manufacturingUnitName = batch.manufacturingUnitName;
        }
        await finEntry.save();
      } else {
        finEntry = await InventoryEntry.create({
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          productId: item.productId,
          productType: item.product.productType || '',
          size:        item.product.size        || '',
          colour:      item.product.colour      || '',
          shape:       item.product.shape       || '',
          weight:      item.product.weight      || '',
          hsnCode:     item.product.hsnCode     || '',
          vendorId:    item.product.vendorId    || null,
          vendorName:  'In-House Production (Self)',
          qtyBoxes:    actualQty,
          packing:     packingSize,
          batchNo:     batch.batchNo,
          mfgDate:     new Date(),
          expiryDate:  new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
          purchaseRate: Number(unitCost.toFixed(2)),
          manufacturingUnitId: batch.manufacturingUnitId,
          manufacturingUnitName: batch.manufacturingUnitName
        });
      }

      item.product.stockLevel += actualQty;
      await item.product.save();

      await StockLedger.create({
        productId: item.productId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'IN',
        qtyBoxes: boxes,
        balanceBoxes: finEntry.qtyBoxes,
        reference: `Production Batch ${batch.batchNo}`,
        note: `Inwarded from Batch Production run by QC Inspector ${qcPassedBy}${batch.manufacturingUnitName ? ` (Mfg Unit: ${batch.manufacturingUnitName})` : ''}`,
        createdBy: qcPassedBy,
        packing: packingSize,
        batchNo: batch.batchNo,
        manufacturingUnitId: batch.manufacturingUnitId,
        manufacturingUnitName: batch.manufacturingUnitName
      });

      createdEntries.push({
        name: item.product.name,
        size: item.product.size || 'Std',
        qty: Number(item.actualYieldQty),
        boxes,
        unitCost: Number(unitCost.toFixed(2))
      });
    }

    const valWaste = wasteQty !== undefined ? Number(wasteQty) : Math.max(0, batch.plannedQty - valYield);
    const variancePct = batch.plannedQty > 0 ? Number((((valYield - batch.plannedQty) / batch.plannedQty) * 100).toFixed(2)) : 0;

    batch.actualYieldQty = valYield;
    batch.wasteQty = valWaste;
    batch.wasteReason = wasteReason || '';
    batch.variancePercent = variancePct;
    batch.unitProductionCost = valYield > 0 ? Number((totalCost / valYield).toFixed(2)) : 0;

    const splitSummary = createdEntries.map(e => `${e.name} (${e.size}): ${e.qty} units (${e.boxes} boxes @ ₹${e.unitCost}/unit)`).join('\n');
    batch.qcNotes = `${qcNotes ? qcNotes.trim() + '\n\n' : ''}Packaging Split Inward:\n${splitSummary}`;
    batch.qcPassedBy = qcPassedBy.trim();
    batch.status = 'completed';
    batch.endDate = new Date();

    const qcStage = batch.stages.find(s => s.name.toLowerCase().includes('qc'));
    if (qcStage && qcStage.status !== 'completed') {
      qcStage.status = 'completed';
      qcStage.completedAt = new Date();
      qcStage.completedBy = qcPassedBy.trim();
    }
    const packagingStage = batch.stages.find(s => s.name.toLowerCase().includes('packaging') || s.name.toLowerCase().includes('label'));
    if (packagingStage && packagingStage.status !== 'completed') {
      packagingStage.status = 'completed';
      packagingStage.completedAt = new Date();
      packagingStage.completedBy = qcPassedBy.trim();
    }

    await batch.save();
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/cancel — Cancel active production run, revert raw materials stock
router.patch('/:id/cancel', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed batch' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Batch is already cancelled' });
    }

    for (const item of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(item.rawMaterialEntryId);
      if (entry) {
        entry.qty += item.qtyConsumed;
        await entry.save();
      } else {
        await RawMaterialEntry.create({
          rawMaterialId: item.rawMaterialId,
          batchNo: item.batchNo,
          qty: item.qtyConsumed,
          purchaseRate: 0
        });
      }
    }

    batch.stages.forEach(s => {
      if (s.status === 'in_progress') {
        s.status = 'pending';
        s.startedAt = null;
      }
    });
    batch.status = 'cancelled';
    batch.endDate = new Date();
    await batch.save();

    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/genealogy/search — Search genealogy by Finished Goods Batch No or Raw Material Batch No
router.get('/genealogy/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Search query is required' });

    // 1. Check if it matches a Finished Goods Batch No
    const fb = await BatchProduction.findOne({ batchNo: { $regex: new RegExp('^' + q + '$', 'i') } })
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .lean();

    if (fb) {
      const enrichedIngredients = [];
      for (const ing of fb.ingredientsConsumed) {
        const entry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
        enrichedIngredients.push({
          rawMaterialId: ing.rawMaterialId,
          rawMaterialEntryId: ing.rawMaterialEntryId,
          qtyConsumed: ing.qtyConsumed,
          batchNo: ing.batchNo,
          sourceBatch: entry ? {
            vendorName: entry.vendorName || 'Direct',
            purchaseRate: entry.purchaseRate || 0,
            originalQty: (entry.qty || 0) + ing.qtyConsumed,
            expiryDate: entry.expiryDate
          } : null
        });
      }
      return res.json({
        type: 'batch',
        data: {
          batchNo: fb.batchNo,
          productName: fb.productId ? fb.productId.name : 'Unknown',
          productSku: fb.productId ? fb.productId.sku : '',
          status: fb.status,
          startDate: fb.startDate,
          endDate: fb.endDate,
          plannedQty: fb.plannedQty,
          actualYieldQty: fb.actualYieldQty || 0,
          wasteQty: fb.wasteQty || 0,
          wasteReason: fb.wasteReason || '',
          variancePercent: fb.variancePercent || 0,
          qcStatus: fb.qcStatus || 'approved',
          qcParameters: fb.qcParameters || null,
          ingredients: enrichedIngredients
        }
      });
    }

    // 2. Otherwise, check if it matches a Consumed Raw Material Batch No
    const matchingBatches = await BatchProduction.find({ 
      'ingredientsConsumed.batchNo': { $regex: new RegExp('^' + q + '$', 'i') } 
    })
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .lean();

    if (matchingBatches.length > 0) {
      const firstMatch = matchingBatches[0];
      const matchedIng = firstMatch.ingredientsConsumed.find(i => i.batchNo.toLowerCase() === q.toLowerCase());
      const rmName = matchedIng && matchedIng.rawMaterialId ? matchedIng.rawMaterialId.name : 'Raw Material';
      const rmSku = matchedIng && matchedIng.rawMaterialId ? matchedIng.rawMaterialId.sku : '';
      const rmUnit = matchedIng && matchedIng.rawMaterialId ? matchedIng.rawMaterialId.unit : '';

      return res.json({
        type: 'material_batch',
        data: {
          rawMaterialBatchNo: q,
          rawMaterialName: rmName,
          rawMaterialSku: rmSku,
          totalBatchesUsedIn: matchingBatches.length,
          batches: matchingBatches.map(b => {
            const ingUsed = b.ingredientsConsumed.find(i => i.batchNo.toLowerCase() === q.toLowerCase());
            return {
              batchProductionId: b._id,
              batchNo: b.batchNo,
              productName: b.productId ? b.productId.name : 'Unknown',
              productSku: b.productId ? b.productId.sku : '',
              status: b.status,
              totalConsumed: ingUsed ? ingUsed.qtyConsumed : 0,
              unit: rmUnit
            };
          })
        }
      });
    }

    return res.status(404).json({ error: `No genealogy record found matching batch number "${q}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/genealogy — Full genealogy with raw material entry details
router.get('/:id/genealogy', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id)
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .lean();

    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    const enrichedIngredients = [];
    for (const ing of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
      enrichedIngredients.push({
        rawMaterialId: ing.rawMaterialId,
        rawMaterialEntryId: ing.rawMaterialEntryId,
        qtyConsumed: ing.qtyConsumed,
        batchNo: ing.batchNo,
        sourceBatch: entry ? {
          vendorName: entry.vendorName || 'Direct',
          purchaseRate: entry.purchaseRate || 0,
          originalQty: (entry.qty || 0) + ing.qtyConsumed,
          expiryDate: entry.expiryDate
        } : null
      });
    }

    res.json({
      batchNo: batch.batchNo,
      productName: batch.productId ? batch.productId.name : 'Unknown',
      productSku: batch.productId ? batch.productId.sku : '',
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || 0,
      wasteQty: batch.wasteQty || 0,
      wasteReason: batch.wasteReason || '',
      variancePercent: batch.variancePercent || 0,
      qcStatus: batch.qcStatus || 'approved',
      qcParameters: batch.qcParameters || null,
      ingredients: enrichedIngredients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/bmr-report — Generate a compliance-friendly BMR
router.get('/:id/bmr-report', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id)
      .populate('productId')
      .populate('ingredientsConsumed.rawMaterialId')
      .lean();

    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const enrichedIngredients = [];

    for (const ing of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
      const rate = entry ? (entry.purchaseRate || 0) : 0;
      enrichedIngredients.push({
        name: ing.rawMaterialId ? ing.rawMaterialId.name : 'Unknown Material',
        code: ing.rawMaterialId ? ing.rawMaterialId.code : 'N/A',
        batchNo: ing.batchNo,
        qtyConsumed: ing.qtyConsumed,
        unit: ing.rawMaterialId ? ing.rawMaterialId.unit : 'kg',
        purchaseRate: rate,
        itemCost: Number((ing.qtyConsumed * rate).toFixed(2))
      });
    }

    res.json({
      batchNo: batch.batchNo,
      productName: batch.productId ? batch.productId.name : 'Unknown Product',
      productSku: batch.productId ? batch.productId.sku : 'N/A',
      productPrice: batch.productId ? batch.productId.price : 0,
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || 0,
      wasteQty: batch.wasteQty || 0,
      wasteReason: batch.wasteReason || '',
      variancePercent: batch.variancePercent || 0,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      qcNotes: batch.qcNotes || 'N/A',
      qcPassedBy: batch.qcPassedBy || 'N/A',
      qcStatus: batch.qcStatus || 'approved',
      qcParameters: batch.qcParameters || null,
      rawMaterialCost: batch.rawMaterialCost || 0,
      overheadCost: batch.overheadCost || 0,
      unitProductionCost: batch.unitProductionCost || 0,
      stages: batch.stages || [],
      ingredients: enrichedIngredients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/documents — Add a supporting document
router.patch('/:id/documents', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Document name and url are required' });

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const { getRenamedFilename, appendDocument } = require('../../utils/documentHelper');
    const cleanDocName = getRenamedFilename(name, 'batch', batch.batchNo || batch._id);
    const updatedBatch = await appendDocument(BatchProduction, req.params.id, cleanDocName, url);

    res.json(updatedBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/batch-productions/:id/documents — Remove a supporting document
router.delete('/:id/documents', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Document URL is required' });

    const { removeDocument } = require('../../utils/documentHelper');
    const updatedBatch = await removeDocument(BatchProduction, req.params.id, url);

    res.json(updatedBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
