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
    const { productId, plannedQty, batchNo } = req.body;
    if (!productId || !plannedQty || !batchNo) {
      return res.status(400).json({ error: 'Product ID, planned quantity, and batch number are required' });
    }

    const valPlanned = Number(plannedQty);
    if (isNaN(valPlanned) || valPlanned <= 0) {
      return res.status(400).json({ error: 'Planned quantity must be a positive number' });
    }

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

    const ingredientsRequired = bom.ingredients.map(ing => {
      const scale = valPlanned / bom.batchYieldSize;
      const qtyNeeded = ing.qtyRequired * scale;
      return { rawMaterialId: ing.rawMaterialId, qtyNeeded };
    });

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

    const newBatch = await BatchProduction.create({
      batchNo: batchNo.trim().toUpperCase(),
      productId,
      plannedQty: valPlanned,
      status: 'in_progress',
      stages: BatchProduction.MANUFACTURING_STAGES.map((name, i) => ({
        name,
        status: i === 0 ? 'in_progress' : 'pending',
        startedAt: i === 0 ? new Date() : null
      })),
      ingredientsConsumed,
      rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
      startDate: new Date()
    });

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

    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid stage status' });
    }

    const currentStage = batch.stages[stageIndex];
    const newStatus = status || 'completed';

    if (newStatus === 'in_progress') {
      currentStage.startedAt = currentStage.startedAt || new Date();
    }
    if (newStatus === 'completed' || newStatus === 'skipped') {
      currentStage.completedAt = new Date();
      currentStage.completedBy = completedBy || '';
    }
    if (notes !== undefined) {
      currentStage.notes = notes;
    }
    currentStage.status = newStatus;

    if ((newStatus === 'completed' || newStatus === 'skipped') && stageIndex + 1 < batch.stages.length) {
      const nextStage = batch.stages[stageIndex + 1];
      if (nextStage.status === 'pending') {
        nextStage.status = 'in_progress';
        nextStage.startedAt = new Date();
      }
    }

    const allDone = batch.stages.every(s => s.status === 'completed' || s.status === 'skipped');
    if (allDone && batch.status === 'in_progress') {
      batch.status = 'qc_hold';
    }

    await batch.save();
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/complete — Complete batch, record QC and inward finished stock
router.patch('/:id/complete', validate(schemas.batchCompleteSchema), async (req, res) => {
  try {
    const { actualYieldQty, wasteQty, wasteReason, qcNotes, qcPassedBy, packing } = req.body;
    if (actualYieldQty === undefined || !qcPassedBy) {
      return res.status(400).json({ error: 'Actual yield quantity and QC inspector name are required' });
    }

    const valYield = Number(actualYieldQty);
    if (isNaN(valYield) || valYield < 0) {
      return res.status(400).json({ error: 'Actual yield must be a positive number' });
    }

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed') {
      return res.status(400).json({ error: 'Batch is already completed' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled batch' });
    }

    const allDone = batch.stages.every(s => s.status === 'completed' || s.status === 'skipped');
    if (!allDone) {
      const pending = batch.stages.filter(s => s.status === 'pending' || s.status === 'in_progress').map(s => s.name);
      return res.status(400).json({ error: `Cannot complete batch. Pending stages: ${pending.join(', ')}` });
    }

    const prod = await Product.findById(batch.productId);
    if (!prod) return res.status(404).json({ error: 'Product definition not found' });

    const warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    if (!warehouse) {
      return res.status(500).json({ error: 'No warehouse configured. Please create one in Settings.' });
    }

    // Use packing from request body; falls back to existing inventory entry packing or 1
    const packingSize = packing || (await InventoryEntry.findOne({ productId: prod._id }))?.packing || 1;
    const boxes = Math.ceil(valYield / packingSize);

    let finEntry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: prod._id,
      batchNo: batch.batchNo
    });

    if (finEntry) {
      finEntry.qtyBoxes += boxes;
      await finEntry.save();
    } else {
      finEntry = await InventoryEntry.create({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: prod._id,
        productType: prod.productType || '',
        size:        prod.size        || '',
        colour:      prod.colour      || '',
        shape:       prod.shape       || '',
        weight:      prod.weight      || '',
        hsnCode:     prod.hsnCode     || '',
        vendorId:    prod.vendorId    || '',
        vendorName:  prod.vendorName  || '',
        qtyBoxes:    boxes,
        packing:     packingSize,
        batchNo:     batch.batchNo,
        mfgDate:     new Date(),
        expiryDate:  new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000)
      });
    }

    prod.stockLevel += boxes;
    await prod.save();

    await StockLedger.create({
      productId: prod._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: boxes,
      balanceBoxes: finEntry.qtyBoxes,
      reference: `Production Batch ${batch.batchNo}`,
      note: `Inwarded from Batch Production run by QC Inspector ${qcPassedBy}`,
      createdBy: qcPassedBy,
      packing: packingSize,
      batchNo: batch.batchNo
    });

    const valWaste = wasteQty !== undefined ? Number(wasteQty) : Math.max(0, batch.plannedQty - valYield);
    const variancePct = batch.plannedQty > 0 ? Number((((valYield - batch.plannedQty) / batch.plannedQty) * 100).toFixed(2)) : 0;

    batch.actualYieldQty = valYield;
    batch.wasteQty = valWaste;
    batch.wasteReason = wasteReason || '';
    batch.variancePercent = variancePct;
    batch.unitProductionCost = valYield > 0 ? Number((batch.rawMaterialCost / valYield).toFixed(2)) : 0;
    batch.qcNotes = qcNotes ? qcNotes.trim() : '';
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
      rawMaterialCost: batch.rawMaterialCost || 0,
      unitProductionCost: batch.unitProductionCost || 0,
      stages: batch.stages || [],
      ingredients: enrichedIngredients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
