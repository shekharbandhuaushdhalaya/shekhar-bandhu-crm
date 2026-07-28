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
      .select('-bomSnapshot.stages -yields')
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
    const { productId, plannedQty, batchNo, manufacturingUnitId, productionType, jobWorkMode, packagingMode, jobWorkerId, jobWorkerName, jobWorkerChallanRef, plannedYields, expiryDate } = req.body;

    // If multi-size yields are provided, compute total plannedQty from them
    let effectivePlannedQty = plannedQty;
    let effectiveYields = null;
    if (plannedYields && Array.isArray(plannedYields) && plannedYields.length > 0) {
      // Deduplicate by productId (first occurrence wins)
      const seen = new Set();
      const uniqueYields = plannedYields.filter(y => {
        const key = y.productId ? y.productId.toString() : '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      effectivePlannedQty = uniqueYields.reduce((sum, y) => sum + Number(y.plannedQty), 0);
      effectiveYields = uniqueYields.map(y => ({
        productId: y.productId,
        plannedQty: Number(y.plannedQty),
        size: y.size || ''
      }));
    }

    if (!productId || !effectivePlannedQty || !batchNo || !manufacturingUnitId) {
      return res.status(400).json({ error: 'Product ID, planned quantity, batch number, and manufacturing unit ID are required' });
    }

    const valPlanned = Number(effectivePlannedQty);
    if (isNaN(valPlanned) || valPlanned <= 0) {
      return res.status(400).json({ error: 'Planned quantity must be a positive number' });
    }

    const { runWithTransaction } = require('../../utils/transactionHelper');

    const newBatch = await runWithTransaction(async (session) => {
      const ManufacturingUnit = require('../../models/ManufacturingUnit');
      const mfgUnit = await ManufacturingUnit.findById(manufacturingUnitId).session(session);
      if (!mfgUnit) throw new Error('Manufacturing unit not found');

      const existingBatch = await BatchProduction.findOne({ batchNo: batchNo.trim().toUpperCase() }).session(session);
      if (existingBatch) {
        throw new Error(`Production batch number ${batchNo} already exists`);
      }

      const prod = await Product.findById(productId).session(session);
      if (!prod) throw new Error('Finished product not found');

      // If multi-size yields specified, validate each product belongs to this product family
      if (effectiveYields) {
        const yieldIds = effectiveYields.map(y => y.productId);
        const familyProducts = await Product.find({ _id: { $in: yieldIds }, $or: [{ _id: productId }, { parentId: productId }] }).session(session);
        const foundIds = familyProducts.map(c => c._id.toString());
        for (const y of effectiveYields) {
          if (!foundIds.includes(y.productId.toString())) {
            throw new Error(`Product ${y.productId} is not a valid size variant of ${prod.name}`);
          }
          // Copy size from product
          const match = familyProducts.find(c => c._id.toString() === y.productId.toString());
          if (match) y.size = match.size || '';
        }
      }

      let bom;
      if (req.body.bomId) {
        bom = await BillOfMaterials.findById(req.body.bomId).session(session);
        if (!bom) throw new Error('Selected recipe formulation was not found');
      } else {
        bom = await BillOfMaterials.findOne({ productId, isDefault: true }).session(session);
        if (!bom) {
          bom = await BillOfMaterials.findOne({ productId }).session(session);
        }
      }
      if (!bom) {
        throw new Error(`No Bill of Materials configured for product: ${prod.name}`);
      }
      if (bom.isActive === false) {
        throw new Error(`The Bill of Materials recipe "${bom.recipeName}" for "${prod.name}" is currently inactive.`);
      }

      const isDirectPurchase = jobWorkMode === 'direct_purchase';
      const ingredientsRequired = [];

      const getSizeInMl = (sizeStr) => {
        const s = (sizeStr || '').toLowerCase().trim();
        const numMatch = s.match(/([\d.]+)/);
        if (!numMatch) return 0;
        const numVal = parseFloat(numMatch[1]);
        if (isNaN(numVal) || numVal <= 0) return 0;
        if (s.includes('l') && !s.includes('ml')) return numVal * 1000;
        return numVal;
      };

      // Formulation ingredient quantities on the BOM are always expressed as
      // "qty per 100 output units (100 Liters / 100 Kg / 100 pieces)" — independent of batchYieldSize,
      // which is purely an informational/standard-batch-size field.
      const FORMULATION_BASIS = 100;
      if (!isDirectPurchase) {
        for (const ing of bom.ingredients) {
          const rm = await RawMaterial.findById(ing.rawMaterialId).session(session);
          const isPackaging = ing.itemType === 'packaging' || (rm && rm.category === 'Packaging');
          const hasStage = ing.stageName && ing.stageName.trim().length > 0;
          if (!isPackaging && !hasStage) {
            let qtyNeeded;
            if (effectiveYields) {
              // For multi-size: sum formulation per variant scaled by volume ratio
              const parentSizeMl = getSizeInMl(prod.size || '');
              qtyNeeded = 0;
              for (const y of effectiveYields) {
                const variantSizeMl = getSizeInMl(y.size || '');
                const volumeRatio = (parentSizeMl > 0 && variantSizeMl > 0) ? (variantSizeMl / parentSizeMl) : 1;
                qtyNeeded += ing.qtyRequired * (y.plannedQty / FORMULATION_BASIS) * volumeRatio;
              }
            } else {
              qtyNeeded = ing.qtyRequired * (valPlanned / FORMULATION_BASIS);
            }
            ingredientsRequired.push({ rawMaterialId: ing.rawMaterialId, qtyNeeded });
          }
        }
      }

      const verifiedDeductions = [];
      if (!isDirectPurchase) {
        for (const reqIng of ingredientsRequired) {
          const rm = await RawMaterial.findById(reqIng.rawMaterialId).session(session);
          const entries = await RawMaterialEntry.find({ rawMaterialId: reqIng.rawMaterialId, warehouseId: manufacturingUnitId }).session(session);

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
            throw new Error(`Insufficient stock for raw material: ${rm.name}. Needed: ${reqIng.qtyNeeded.toFixed(2)} ${rm.unit}, Available: ${totalAvailable.toFixed(2)} ${rm.unit}`);
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
      }

      const ingredientsConsumed = [];
      let rawMaterialCost = 0;
      if (!isDirectPurchase) {
        for (const dec of verifiedDeductions) {
          const { entry, deductQty, rawMaterialId } = dec;
          entry.qty = Math.max(0, entry.qty - deductQty);
          await entry.save({ session });
          rawMaterialCost += deductQty * (entry.purchaseRate || 0);
          ingredientsConsumed.push({
            rawMaterialId,
            rawMaterialEntryId: entry._id,
            qtyConsumed: deductQty,
            batchNo: entry.batchNo
          });
        }
      }

      // Scaled overhead calculation — same fixed per-100-output-unit basis as formulation ingredients
      const overheadScale = valPlanned / FORMULATION_BASIS;
      const computedOverhead = (bom.overheadCost || 0) * overheadScale;

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

      const [newBatchDoc] = await BatchProduction.create([{
        batchNo: batchNo.trim().toUpperCase(),
        productId,
        bomId: bom._id,
        bomSnapshot: {
          recipeName: bom.recipeName || '',
          recipeVersion: bom.recipeVersion || `v${bom.__v || 0}`,
          ingredients: (bom.ingredients || []).map(i => ({
            rawMaterialId: i.rawMaterialId,
            itemType: i.itemType || 'formulation',
            qtyRequired: i.qtyRequired || 0,
            stageName: i.stageName || ''
          })),
          overheadCost: bom.overheadCost || 0,
          stages: (bom.stages || []).map(s => ({ name: s.name, targetDurationDays: s.targetDurationDays || 1 }))
        },
        manufacturingUnitId,
        manufacturingUnitName: mfgUnit.name,
        plannedQty: valPlanned,
        plannedYields: effectiveYields || [],
        status: 'in_progress',
        stages: batchStages,
        ingredientsConsumed,
        rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
        overheadCost: Number(computedOverhead.toFixed(2)),
        productionType: productionType || 'in_house',
        jobWorkMode: jobWorkMode || 'none',
        packagingMode: packagingMode || 'packed_by_vendor',
        jobWorkerId: jobWorkerId || null,
        jobWorkerName: jobWorkerName || '',
        jobWorkerChallanRef: jobWorkerChallanRef || '',
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        startDate: new Date()
      }], { session });

      return newBatchDoc;
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
router.patch('/:id/stage/:stageIndex', validate(schemas.batchStageUpdateSchema), async (req, res) => {
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
      if (batch.packagingMode === 'self_packed') {
        const plannedYields = batch.plannedYields && batch.plannedYields.length > 0 ? batch.plannedYields : null;
        if (plannedYields) {
          const yieldInput = plannedYields.map(y => ({
            productId: y.productId,
            actualYieldQty: y.plannedQty
          }));
          await deductPackagingMaterials(batch, yieldInput);
        } else {
          await deductPackagingMaterials(batch, batch.plannedQty);
        }
      } else {
        batch.packagingDeducted = true;
      }
    }

    // Deduct stage-tied ingredients from inventory (FIFO) when stage is completed
    // Guard: skip if already deducted to prevent double-deduction on re-completion
    if (!currentStage.ingredientsDeducted) {
      const RawMaterialEntry = require('../../models/RawMaterialEntry');
      const stageIngredients = req.body.stageIngredients;
      if (newStatus === 'completed' && stageIngredients && stageIngredients.length > 0) {
        let totalInputQty = 0;
        let totalLossQty = 0;
        for (const si of stageIngredients) {
          const qtyNeeded = Number(si.qtyNeeded) || 0;
          const wastage = Number(si.wastage) || 0;
          if (qtyNeeded <= 0) continue;

          const entries = await RawMaterialEntry.find({ rawMaterialId: si.rawMaterialId, warehouseId: batch.manufacturingUnitId });
          entries.sort((a, b) => {
            if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
            if (a.expiryDate && !b.expiryDate) return -1;
            if (!a.expiryDate && b.expiryDate) return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          let needed = qtyNeeded;
          for (const entry of entries) {
            if (needed <= 0.0001) break;
            if ((entry.qty || 0) <= 0) continue;
            const rawDeduct = Math.min(needed, entry.qty);
            const deduct = Number(rawDeduct.toFixed(2));
            if (deduct <= 0) continue;

            entry.qty = Math.max(0, Number((entry.qty - deduct).toFixed(2)));
            await entry.save();

            batch.rawMaterialCost += deduct * (entry.purchaseRate || 0);
            batch.ingredientsConsumed.push({
              rawMaterialId: si.rawMaterialId,
              rawMaterialEntryId: entry._id,
              qtyConsumed: deduct,
              batchNo: entry.batchNo
            });
            needed -= deduct;
          }

          totalInputQty += qtyNeeded;
          totalLossQty += wastage;
        }

        currentStage.inputQty = (currentStage.inputQty || 0) + totalInputQty;
        currentStage.lossQty = (currentStage.lossQty || 0) + totalLossQty;
        currentStage.outputQty = Math.max(0, currentStage.inputQty - currentStage.lossQty);
        currentStage.lossPercent = currentStage.inputQty > 0 ? Number(((currentStage.lossQty / currentStage.inputQty) * 100).toFixed(2)) : 0;
        if (req.body.lossReason) currentStage.lossReason = req.body.lossReason;
        currentStage.ingredientsDeducted = true;
      }
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
async function deductPackagingMaterials(batch, outputQtyOrYields) {
  if (batch.packagingDeducted) return;

  const BillOfMaterials = require('../../models/BillOfMaterials');
  const RawMaterial = require('../../models/RawMaterial');
  const RawMaterialEntry = require('../../models/RawMaterialEntry');

  let itemsToProcess = [];
  if (Array.isArray(outputQtyOrYields)) {
    itemsToProcess = outputQtyOrYields;
  } else {
    itemsToProcess = [{
      productId: batch.productId.toString(),
      actualYieldQty: Number(outputQtyOrYields) || 0
    }];
  }

  for (const item of itemsToProcess) {
    const qty = Number(item.actualYieldQty);
    if (qty <= 0) continue;

    // Find BOM for this specific variant (size) or fallback to batch's BOM
    let bom = await BillOfMaterials.findOne({ productId: item.productId, isActive: true });
    if (!bom) {
      bom = await BillOfMaterials.findById(batch.bomId);
    }
    if (!bom) continue;

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

    if (!pkgIngs || pkgIngs.length === 0) continue;

    for (const ing of pkgIngs) {
      // Packaging items are specified as direct per-unit pieces (e.g. 1 cap per unit produced, 1 box per unit produced)
      const qtyNeeded = ing.qtyRequired * qty;
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      if (!rm) continue;

      const entries = await RawMaterialEntry.find({ rawMaterialId: ing.rawMaterialId, warehouseId: batch.manufacturingUnitId });
      entries.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
        if (a.expiryDate && !b.expiryDate) return -1;
        if (!a.expiryDate && b.expiryDate) return 1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      let needed = qtyNeeded;
      for (const entry of entries) {
        if (needed <= 0.0001) break;
        if ((entry.qty || 0) <= 0) continue;
        const rawDeduct = Math.min(needed, entry.qty);
        // Round to 2 decimal places to avoid floating point micro-fractions
        const deduct = Number(rawDeduct.toFixed(2));
        if (deduct <= 0) continue;

        entry.qty = Math.max(0, Number((entry.qty - deduct).toFixed(2)));
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
      warehouseId,
      jobWorkerCertificateRef,
      coaDocumentRef,
      jobWorkCharges
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

    // Build the yields list (split or main single product)
    const yieldsList = yields && Array.isArray(yields) && yields.length > 0 ? yields : [{
      productId: batch.productId.toString(),
      actualYieldQty: valYield,
      packing: packing || 1
    }];

    // Validate products exist
    const Product = require('../../models/Product');
    const productIds = yieldsList.map(y => y.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    for (const y of yieldsList) {
      if (!productMap[y.productId]) {
        return res.status(404).json({ error: `Yield product not found: ${y.productId}` });
      }
      const yQty = Number(y.actualYieldQty);
      if (isNaN(yQty) || yQty < 0) {
        return res.status(400).json({ error: 'Yield quantity must be a non-negative number' });
      }
    }

    // Ensure packaging materials are deducted if not already deducted during stage advance
    if (!batch.packagingDeducted) {
      if (batch.packagingMode === 'self_packed') {
        await deductPackagingMaterials(batch, yieldsList);
      } else {
        batch.packagingDeducted = true;
      }
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
    batch.jobWorkerCertificateRef = jobWorkerCertificateRef || '';
    batch.coaDocumentRef = coaDocumentRef || '';
    batch.jobWorkCharges = Number(jobWorkCharges) || 0;
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

    const totalCost = batch.rawMaterialCost + (batch.overheadCost || 0) + batch.jobWorkCharges;

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
      if (req.io) {
        req.io.emit('mfg_batch_completed', batch);
        req.io.emit('inventory_updated', { type: 'batch_rejected', batchNo: batch.batchNo });
      }
      return res.json(batch);
    }



    // Persist actual yields on batch document
    batch.yields = yieldsList.map(y => ({
      productId: y.productId,
      actualYieldQty: Number(y.actualYieldQty),
      packing: y.packing || 1,
      size: productMap[y.productId] ? (productMap[y.productId].size || '') : ''
    }));

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
    const StockMovement = require('../../models/StockMovement');

    for (const item of yieldItemsWithWeight) {
      const pct = totalAllocWeight > 0 ? (item.allocWeight / totalAllocWeight) : (1 / yieldItemsWithWeight.length);
      const allocatedCost = totalCost * pct;
      const unitCost = item.actualYieldQty > 0 ? (allocatedCost / Number(item.actualYieldQty)) : 0;

      createdEntries.push({
        name: item.product.name,
        size: item.product.size || 'Std',
        qty: Number(item.actualYieldQty),
        boxes: Number(item.actualYieldQty),
        unitCost: Number(unitCost.toFixed(2))
      });
    }

    // Generate Production GRN doc no
    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const lastPR = await StockMovement.findOne({ docNo: { $regex: `^PR/${fy}/` } })
      .sort({ createdAt: -1 }).lean();
    let nextPR = 1;
    if (lastPR) {
      const parts = lastPR.docNo.split('/');
      if (parts.length === 3) nextPR = parseInt(parts[2], 10) + 1;
    }
    const prDocNo = `PR/${fy}/${nextPR.toString().padStart(3, '0')}`;

    const grnItems = yieldItemsWithWeight.map(item => {
      const pct = totalAllocWeight > 0 ? (item.allocWeight / totalAllocWeight) : (1 / yieldItemsWithWeight.length);
      const allocatedCost = totalCost * pct;
      const unitCost = item.actualYieldQty > 0 ? (allocatedCost / Number(item.actualYieldQty)) : 0;
      return {
        productId: item.productId,
        productName: item.product.name,
        qty: Number(item.actualYieldQty),
        packing: 1,
        purchaseRate: Number(unitCost.toFixed(2)),
        batchNo: batch.batchNo,
        mfgDate: new Date(),
        expiryDate: batch.expiryDate || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
        manufacturingUnitId: batch.manufacturingUnitId,
        manufacturingUnitName: batch.manufacturingUnitName
      };
    });

    const grn = await StockMovement.create({
      docNo: prDocNo,
      direction: 'in',
      type: 'production',
      date: new Date(),
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      partyName: 'In-House Production (Self)',
      items: grnItems,
      status: 'draft',
      notes: `QC Sign-off by ${qcPassedBy}. Batch: ${batch.batchNo}. ${qcNotes || ''}`.trim(),
      createdBy: qcPassedBy,
      sourceDocType: 'batch_production',
      sourceDocId: batch._id
    });

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
    batch.mfgDate = new Date();

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
    if (req.io) {
      req.io.emit('mfg_batch_completed', batch);
      req.io.emit('challan_created', grn);
    }
    res.json({ batch, grn: { _id: grn._id, docNo: grn.docNo, status: grn.status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/cancel — Cancel active production run, revert raw materials stock
router.patch('/:id/cancel', validate(schemas.batchCancelSchema), async (req, res) => {
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

    if (req.io) {
      req.io.emit('mfg_batch_cancelled', { batchNo: batch.batchNo, id: batch._id });
      req.io.emit('inventory_updated', { type: 'batch_cancelled', batchNo: batch.batchNo });
    }
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

    const productPopulated = batch.productId ? batch.productId : null;

    // Fetch product names for plannedYields / yields if productId is not populated
    const yieldProdIds = new Set();
    if (batch.plannedYields) batch.plannedYields.forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    if (batch.yields) batch.yields.forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    const yieldProducts = yieldProdIds.size > 0 ? await Product.find({ _id: { $in: [...yieldProdIds] } }).select('name size sku').lean() : [];
    const yieldProdMap = {};
    yieldProducts.forEach(p => { yieldProdMap[p._id.toString()] = p; });

    res.json({
      batchNo: batch.batchNo,
      productName: productPopulated ? productPopulated.name : 'Unknown Product',
      productSku: productPopulated ? productPopulated.sku : 'N/A',
      productPrice: productPopulated ? productPopulated.price : 0,
      productSize: productPopulated ? productPopulated.size : '',
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || 0,
      plannedYields: (batch.plannedYields || []).map(y => ({
        productId: y.productId ? y.productId.toString() : '',
        plannedQty: y.plannedQty,
        size: y.size || (y.productId ? (yieldProdMap[y.productId.toString()]?.size || '') : ''),
        productName: y.productId ? (yieldProdMap[y.productId.toString()]?.name || '') : ''
      })),
      yields: (batch.yields || []).map(y => ({
        productId: y.productId ? y.productId.toString() : '',
        actualYieldQty: y.actualYieldQty,
        packing: y.packing || 1,
        size: y.size || (y.productId ? (yieldProdMap[y.productId.toString()]?.size || '') : ''),
        productName: y.productId ? (yieldProdMap[y.productId.toString()]?.name || '') : ''
      })),
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
      ingredients: enrichedIngredients,
      bomSnapshot: batch.bomSnapshot || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/documents — Add a supporting document
router.patch('/:id/documents', validate(schemas.batchDocumentAddSchema), async (req, res) => {
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
router.delete('/:id/documents', validate(schemas.batchDocumentRemoveSchema), async (req, res) => {
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