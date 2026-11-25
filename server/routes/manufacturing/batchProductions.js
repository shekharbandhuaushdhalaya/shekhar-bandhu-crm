const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const BillOfMaterials = require('../../models/BillOfMaterials');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const RawMaterialLedger = require('../../models/RawMaterialLedger');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { getSizeInMl, releaseAllReservations, deductPackagingMaterials, calculateAggregateMaterialSufficiency } = require('../../services/batchProductionService');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { resolveManufacturingWarehouse } = require('../../services/manufacturingWarehouseService');
const { withTransaction } = require('../../utils/withTransaction');
const idempotency = require('../../middleware/requiredIdempotency');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

function getMaterialGenealogyIssues(batch, dispensingRecords = []) {
  const issues = [];
  const formula = batch.bomSnapshot && batch.bomSnapshot.ingredients;
  if (!Array.isArray(formula) || formula.length === 0) return ['Pinned, non-empty batch formula snapshot is missing'];
  const consumed = Array.isArray(batch.ingredientsConsumed) ? batch.ingredientsConsumed : [];
  const records = Array.isArray(dispensingRecords) ? dispensingRecords : [];
  const verifiedRecords = new Map();
  const verifiedItems = new Set();
  if (formula.some(item => item.itemType !== 'packaging') && records.length === 0) {
    issues.push('No independently verified material dispensing records are recorded');
  }
  for (const record of records) {
    const independent = record.status === 'verified' && record.dispensedBy && record.verifiedBy &&
      String(record.dispensedBy) !== String(record.verifiedBy) && record.verifiedAt;
    if (!independent) {
      issues.push('Material dispensing record is not independently verified: ' + (record.dispensingNo || String(record._id || 'Unknown')));
      continue;
    }
    verifiedRecords.set(String(record.dispensingNo), record);
    for (const item of record.items || []) {
      verifiedItems.add(String(record.dispensingNo) + ':' + String(item.rawMaterialEntryId));
    }
  }
  if (consumed.length === 0) issues.push('No actual raw-material consumption genealogy is recorded');
  for (const item of consumed) {
    const qty = Number(item.qtyConsumed), wasted = Number(item.qtyWasted || 0);
    if (!item.rawMaterialId || !item.rawMaterialEntryId || !item.batchNo ||
        !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(Number(item.stageIndex)) || !item.dispensingNo) {
      issues.push('A consumed material line is missing its stock lot, dispensing, stage or quantity evidence');
      continue;
    }
    if (!verifiedRecords.has(String(item.dispensingNo)) ||
        !verifiedItems.has(String(item.dispensingNo) + ':' + String(item.rawMaterialEntryId))) {
      issues.push('Consumed material line is not linked to an independently verified dispensing record: ' + String(item.rawMaterialId));
    }
    if (!Number.isFinite(wasted) || wasted < 0 || wasted > qty ||
        (wasted > 0 && !String(item.wastageReason || '').trim())) {
      issues.push('Consumed material line has invalid or unexplained wastage: ' + String(item.rawMaterialId));
    }
  }
  const plannedQty = Number(batch.plannedQty), basis = Number(batch.bomSnapshot.formulationBasis || 100);
  const required = new Map();
  for (const ingredient of formula) {
    if (ingredient.itemType === 'packaging') continue;
    const materialId = ingredient.rawMaterialId && ingredient.rawMaterialId._id
      ? String(ingredient.rawMaterialId._id) : String(ingredient.rawMaterialId || '');
    if (!materialId) { issues.push('A formula ingredient is missing its raw-material identity'); continue; }
    const stageName = String(ingredient.stageName || '').trim().toLowerCase();
    const stageIndex = stageName
      ? (batch.stages || []).findIndex(stage => String(stage.name || '').trim().toLowerCase() === stageName)
      : 0;
    if (stageIndex < 0) { issues.push('Formula ingredient has no matching manufacturing stage: ' + materialId); continue; }
    const expected = ingredient.qtyRequiredForBatch !== undefined && ingredient.qtyRequiredForBatch !== null
      ? Number(ingredient.qtyRequiredForBatch)
      : Number(ingredient.qtyRequired || 0) * (basis > 0 ? plannedQty / basis : 0);
    if (!Number.isFinite(expected) || expected <= 0) { issues.push('Formula ingredient has no valid positive batch quantity: ' + materialId); continue; }
    const key = materialId + ':' + stageIndex;
    const current = required.get(key) || { materialId, stageIndex, expected: 0 };
    current.expected += expected;
    required.set(key, current);
  }
  for (const line of required.values()) {
    const actual = consumed.filter(item => {
      const id = item.rawMaterialId && item.rawMaterialId._id
        ? String(item.rawMaterialId._id) : String(item.rawMaterialId || '');
      return id === line.materialId && Number(item.stageIndex) === line.stageIndex;
    }).reduce((sum, item) => sum + (Number(item.qtyConsumed) || 0), 0);
    if (actual + 0.0001 < line.expected) {
      issues.push('Verified material consumption is below the pinned formula requirement for ' +
        line.materialId + ' at stage ' + line.stageIndex + ' (required ' +
        line.expected.toFixed(4) + ', recorded ' + actual.toFixed(4) + ')');
    }
  }
  return [...new Set(issues)];
}


// POST /api/batch-productions/planning/aggregate-sufficiency — Aggregate raw material sufficiency across planned batches
router.post('/planning/aggregate-sufficiency', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { batchIds } = req.body;
    if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
      return res.status(400).json({ error: 'batchIds array is required' });
    }
    const report = await calculateAggregateMaterialSufficiency(batchIds);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions — List all batch production runs
// Supports ?limit=&skip=&status= for pagination and filtering
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const limit = Math.min(parseInt(req.query.limit) || 0, 500);
    const skip = parseInt(req.query.skip) || 0;
    const statusFilter = req.query.status || '';
    const filter = statusFilter ? { status: statusFilter } : {};
    let query = BatchProduction.find(filter)
      .select('-bomSnapshot.stages')
      .populate('productId', 'name sku size packing')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .sort({ createdAt: -1 })
      .lean();
    if (limit > 0) query = query.skip(skip).limit(limit);
    const batches = await query;
    const total = await BatchProduction.countDocuments(filter);
    if (limit > 0) {
      res.json({ data: batches, total, limit, skip });
    } else {
      res.json(batches);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/preview — Calculate dry-run projected raw material consumption before starting batch
router.get('/preview', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { productId, plannedQty, bomId, manufacturingUnitId } = req.query;
    if (!productId || !plannedQty) {
      return res.status(400).json({ error: 'productId and plannedQty are required' });
    }

    const prod = await Product.findById(productId);
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    let bom;
    if (bomId) {
      bom = await BillOfMaterials.findById(bomId);
    } else {
      bom = await BillOfMaterials.findOne({ productId, isDefault: true }) || await BillOfMaterials.findOne({ productId });
    }
    if (!bom) return res.status(404).json({ error: `No Bill of Materials recipe found for ${prod.name}` });

    const valPlanned = Number(plannedQty);
    if (!Number.isFinite(valPlanned) || valPlanned <= 0) {
      return res.status(400).json({ error: 'plannedQty must be a positive number' });
    }
    if (String(bom.productId) !== String(productId)) {
      return res.status(400).json({ error: 'Selected recipe does not belong to the selected product' });
    }
    const FORMULATION_BASIS = bom.formulationBasis || 100;

    const projectedConsumption = [];
    let isStockSufficient = true;

    for (const ing of (bom.ingredients || [])) {
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      if (!rm) continue;

      const qtyNeeded = (ing.qtyRequired || 0) * (valPlanned / FORMULATION_BASIS);
      let totalAvailable = 0;

      if (manufacturingUnitId) {
        const manufacturingWarehouse = await resolveManufacturingWarehouse(manufacturingUnitId);
        const entries = await RawMaterialEntry.find({ rawMaterialId: rm._id, warehouseId: manufacturingWarehouse._id, qcStatus: 'approved', $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] });
        totalAvailable = entries.reduce((s, e) => s + Math.max(0, Number(e.qty || 0) - Number(e.reservedQty || 0)), 0);
      } else {
        const entries = await RawMaterialEntry.find({ rawMaterialId: rm._id, qcStatus: 'approved', $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] });
        totalAvailable = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.qty || 0) - Number(entry.reservedQty || 0)), 0);
      }

      const isSufficient = totalAvailable >= qtyNeeded;
      if (!isSufficient) isStockSufficient = false;

      projectedConsumption.push({
        rawMaterialId: rm._id,
        rawMaterialName: rm.name,
        unit: rm.unit || 'Kg',
        qtyNeeded: Number(qtyNeeded.toFixed(2)),
        totalAvailable: Number(totalAvailable.toFixed(2)),
        isSufficient,
        shortage: isSufficient ? 0 : Number((qtyNeeded - totalAvailable).toFixed(2))
      });
    }

    res.json({
      productName: prod.name,
      recipeName: bom.recipeName || 'Default Recipe',
      plannedQty: valPlanned,
      isStockSufficient,
      ingredients: projectedConsumption
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions — Start a new batch production run
router.post('/', authorize('manufacturing:create'), validate(schemas.batchProductionSchema), async (req, res) => {
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
      const manufacturingWarehouse = await resolveManufacturingWarehouse(manufacturingUnitId, session);

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
      if (String(bom.productId) !== String(productId)) {
        throw new Error('Selected recipe does not belong to the selected product');
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

      // Formulation ingredient quantities on the BOM are expressed as
      // "qty per formulationBasis output units" — e.g. per 100ml for syrups, per 10 pcs for tablets.
      // formulationBasis defaults to 100 for backwards compatibility.
      const FORMULATION_BASIS = bom.formulationBasis || 100;
      const FORMULATION_BASIS_UNIT = (bom.formulationBasisUnit || 'ml').toLowerCase();
      const defaultStages = [
        { name: 'Raw Material Verification & Weighing', targetDurationHours: 2 },
        { name: 'Primary Processing (Swasan/Mardan)', targetDurationHours: 4 },
        { name: 'Mixing & Blending', targetDurationHours: 4 },
        { name: 'Forming (Vati/Gutika)', targetDurationHours: 4 },
        { name: 'Drying', targetDurationHours: 8 },
        { name: 'QC Testing', targetDurationHours: 4 },
        { name: 'Packaging & Labeling', targetDurationHours: 4 }
      ];
      const customStages = bom.stages && bom.stages.length > 0 ? bom.stages : defaultStages;
      const firstStageName = customStages[0] && customStages[0].name
        ? customStages[0].name
        : 'Raw Material Verification & Weighing';
      const packagingStage = customStages.find(stage => /pack|label/i.test(stage.name || '')) || customStages[customStages.length - 1];
      const packagingStageName = packagingStage && packagingStage.name ? packagingStage.name : firstStageName;
      const blockGroup = [];
      const ingredientSnapshots = [];

      for (const ing of (bom.ingredients || [])) {
        if (!ing.rawMaterialId) throw new Error('Every BOM ingredient must reference a raw material');
        const rm = await RawMaterial.findById(ing.rawMaterialId).session(session);
        if (!rm) throw new Error('Raw material referenced by BOM was not found: ' + String(ing.rawMaterialId));

        const isPackaging = ing.itemType === 'packaging' ||
          rm.materialType === 'packaging' ||
          rm.category === 'Packaging' ||
          rm.category === 'Packaging Material';
        const stageName = ing.stageName && ing.stageName.trim()
          ? ing.stageName.trim()
          : (isPackaging ? packagingStageName : firstStageName);
        let qtyNeeded = 0;

        if (isPackaging) {
          qtyNeeded = Number(ing.qtyRequired || 0) * valPlanned;
        } else if (effectiveYields) {
          let totalBatchVolume = 0;
          let allHaveSizes = true;
          for (const y of effectiveYields) {
            const sizeMl = getSizeInMl(y.size || '');
            if (sizeMl > 0) totalBatchVolume += sizeMl * Number(y.plannedQty);
            else { allHaveSizes = false; break; }
          }
          if (allHaveSizes && totalBatchVolume > 0) {
            const totalInBasisUnit = FORMULATION_BASIS_UNIT === 'l' ? totalBatchVolume / 1000 : totalBatchVolume;
            qtyNeeded = Number(ing.qtyRequired || 0) * (totalInBasisUnit / FORMULATION_BASIS);
          } else {
            const totalPcs = effectiveYields.reduce((sum, y) => sum + Number(y.plannedQty), 0);
            qtyNeeded = Number(ing.qtyRequired || 0) * (totalPcs / FORMULATION_BASIS);
          }
        } else {
          qtyNeeded = Number(ing.qtyRequired || 0) * (valPlanned / FORMULATION_BASIS);
        }

        qtyNeeded = Number(qtyNeeded.toFixed(2));
        ingredientSnapshots.push({
          rawMaterialId: ing.rawMaterialId,
          itemType: ing.itemType || (isPackaging ? 'packaging' : 'formulation'),
          qtyRequired: Number(ing.qtyRequired || 0),
          qtyRequiredForBatch: qtyNeeded,
          stageName
        });
        if (!isDirectPurchase && qtyNeeded > 0) {
          blockGroup.push({
            rawMaterialId: ing.rawMaterialId,
            rmName: rm.name,
            unit: rm.unit || 'Kg',
            qtyNeeded,
            stageName
          });
        }
      }

      // All raw materials, including previously "immediate" untagged ingredients,
      // remain reserved until weighed and independently verified through dispensing.
      const ingredientsConsumed = [];
      const ingredientsReserved = [];
      let rawMaterialCost = 0;

      if (!isDirectPurchase) {
        for (const item of blockGroup) {
          const entries = await RawMaterialEntry.find({
            rawMaterialId: item.rawMaterialId,
            warehouseId: manufacturingWarehouse._id,
            qcStatus: 'approved',
            $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }]
          }).session(session);

          entries.sort((a, b) => {
            if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
            if (a.expiryDate && !b.expiryDate) return -1;
            if (!a.expiryDate && b.expiryDate) return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          const totalAvailable = entries.reduce((sum, entry) =>
            sum + Math.max(0, Number(entry.qty || 0) - Number(entry.reservedQty || 0)), 0);
          if (totalAvailable + 0.0001 < item.qtyNeeded) {
            throw new Error('Insufficient available stock for raw material: ' + item.rmName +
              '. Needed: ' + item.qtyNeeded.toFixed(2) + ' ' + item.unit +
              ', Available: ' + totalAvailable.toFixed(2) + ' ' + item.unit +
              ' (excluding stock reserved for other runs)');
          }

          let needed = item.qtyNeeded;
          for (const entry of entries) {
            if (needed <= 0.0001) break;
            const available = Math.max(0, Number(entry.qty || 0) - Number(entry.reservedQty || 0));
            if (available <= 0.0001) continue;
            const reserve = Number(Math.min(needed, available).toFixed(2));
            if (reserve <= 0) continue;
            entry.reservedQty = Number((Number(entry.reservedQty || 0) + reserve).toFixed(2));
            await entry.save({ session });
            ingredientsReserved.push({
              rawMaterialId: item.rawMaterialId,
              rawMaterialEntryId: entry._id,
              qtyReserved: reserve,
              batchNo: entry.batchNo,
              stageName: item.stageName
            });
            needed = Number((needed - reserve).toFixed(2));
          }
          if (needed > 0.0001) {
            throw new Error('Unable to reserve the full required quantity for raw material: ' + item.rmName);
          }
        }
      }

      // Scaled overhead calculation — same fixed per-100-output-unit basis as formulation ingredients
      const overheadScale = valPlanned / FORMULATION_BASIS;
      const computedOverhead = (bom.overheadCost || 0) * overheadScale;

      const batchStages = customStages.map((st, i) => {
        const startedAt = null;
        const targetDurationHours = st.targetDurationHours || (st.targetDurationDays ? st.targetDurationDays * 24 : 8);
        let targetCompletionDate = null;
        if (startedAt) {
          targetCompletionDate = new Date(startedAt.getTime() + targetDurationHours * 60 * 60 * 1000);
        }
        return {
          name: st.name,
          targetDurationDays: Math.ceil(targetDurationHours / 24),  // legacy field
          targetDurationHours,
          status: 'pending',
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
          formulationBasis: bom.formulationBasis || 100,
          formulationBasisUnit: bom.formulationBasisUnit || 'ml',
          ingredients: ingredientSnapshots,
          overheadCost: bom.overheadCost || 0,
          stages: (bom.stages || []).map(s => ({ name: s.name, targetDurationHours: s.targetDurationHours || (s.targetDurationDays ? s.targetDurationDays * 24 : 8) }))
        },
        manufacturingUnitId,
        manufacturingUnitName: mfgUnit.name,
        plannedQty: valPlanned,
        plannedYields: effectiveYields || [],
        status: 'draft',
        stages: batchStages,
        ingredientsConsumed,
        ingredientsReserved,
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
      req.io.emit('inventory_updated', { type: 'raw_material_reserved', batchNo: newBatch.batchNo });
    }

    res.status(201).json(newBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions/:id/line-clearance — Submit checklist for independent verification.
router.post('/:id/line-clearance', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { previousBatchNo, checklist, notes, phase = 'manufacturing' } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (batch.releasedBy || ['cancelled', 'rejected'].includes(batch.status)) {
      return res.status(409).json({ error: 'Released, cancelled or rejected batch line-clearance records are immutable' });
    }
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated line-clearance operator identity is required' });
    }
    if (!['manufacturing','filling','packing'].includes(phase)) {
      return res.status(400).json({ error: 'phase must be manufacturing, filling or packing' });
    }
    if (!checklist || !checklist.equipmentCleaned || !checklist.previousMaterialsRemoved ||
      !checklist.previousLabelsDocumentsRemoved || !checklist.areaVisuallyInspected) {
      return res.status(400).json({ error: 'All 4 line-clearance checklist items must be verified true before submission' });
    }
    const LineClearance = require('../../models/LineClearance');
    const existing = await LineClearance.findOne({ batchId: batch._id, phase });
    if (existing) {
      return res.status(409).json({ error: 'A line-clearance record already exists for this batch phase; do not overwrite the submitted or verified record' });
    }
    const record = await LineClearance.create({
      batchId: batch._id, phase, cleared: false,
      manufacturingUnitId: batch.manufacturingUnitId,
      previousBatchNo: previousBatchNo || '',
      checklist: {
        equipmentCleaned: checklist.equipmentCleaned === true,
        previousMaterialsRemoved: checklist.previousMaterialsRemoved === true,
        previousLabelsDocumentsRemoved: checklist.previousLabelsDocumentsRemoved === true,
        areaVisuallyInspected: checklist.areaVisuallyInspected === true
      },
      notes: String(notes || '').trim(),
      submittedBy: req.user.id, submittedByName: req.user.name, submittedAt: new Date()
    });
    if (req.io) req.io.emit('line_clearance_updated', record);
    res.status(201).json({ record, status: 'PENDING_INDEPENDENT_VERIFICATION',
      message: 'Line-clearance checklist submitted. Production cannot start until an independent verifier signs it.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/line-clearance/:clearanceId/verify — Independent line-clearance signoff.
router.patch('/:id/line-clearance/:clearanceId/verify', authorize('manufacturing:complete'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (batch.releasedBy) return res.status(409).json({ error: 'Released batch line-clearance records are immutable' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated independent line-clearance verifier identity is required' });
    }
    const LineClearance = require('../../models/LineClearance');
    const record = await LineClearance.findById(req.params.clearanceId);
    if (!record || String(record.batchId) !== String(batch._id)) {
      return res.status(404).json({ error: 'Line-clearance record not found for this batch' });
    }
    if (record.cleared || record.verifiedAt) {
      return res.status(409).json({ error: 'Line-clearance record has already been independently verified' });
    }
    if (!record.submittedBy || String(record.submittedBy) === String(req.user.id)) {
      return res.status(409).json({ error: 'The line-clearance operator cannot independently verify their own checklist' });
    }
    const c = record.checklist || {};
    if (!c.equipmentCleaned || !c.previousMaterialsRemoved || !c.previousLabelsDocumentsRemoved || !c.areaVisuallyInspected) {
      return res.status(400).json({ error: 'All four line-clearance checklist items must be true before verification' });
    }
    record.cleared = true;
    record.clearedBy = req.user.id;
    record.clearedByName = req.user.name;
    record.clearedAt = new Date();
    record.verifiedBy = req.user.id;
    record.verifiedByName = req.user.name;
    record.verifiedAt = new Date();
    await record.save();
    if (req.io) req.io.emit('line_clearance_updated', record);
    res.json({ success: true, record, status: 'VERIFIED' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/approve-bmr — Pre-execution BMR recipe snapshot approval
router.patch('/:id/approve-bmr', authorize('manufacturing:approveBmr'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated BMR approver identity is required' });
    if (batch.status !== 'draft') return res.status(409).json({ error: 'Pre-execution BMR approval is only allowed while the batch remains in draft status' });
    if (!batch.bomSnapshot || !Array.isArray(batch.bomSnapshot.ingredients) || batch.bomSnapshot.ingredients.length === 0) {
      return res.status(409).json({ error: 'A pinned, non-empty batch formula snapshot is required before BMR approval' });
    }

    const PharmacopoeiaEntry = require('../../models/PharmacopoeiaEntry');
    const RawMaterial = require('../../models/RawMaterial');

    // Collect all raw material IDs referenced by batch
    const rmIds = new Set();
    if (batch.bomSnapshot && Array.isArray(batch.bomSnapshot.ingredients)) {
      batch.bomSnapshot.ingredients.forEach(i => {
        if (i.rawMaterialId) rmIds.add(i.rawMaterialId.toString());
      });
    }
    if (Array.isArray(batch.ingredientsConsumed)) {
      batch.ingredientsConsumed.forEach(i => {
        if (i.rawMaterialId) rmIds.add(i.rawMaterialId.toString());
      });
    }
    if (Array.isArray(batch.ingredientsReserved)) {
      batch.ingredientsReserved.forEach(i => {
        if (i.rawMaterialId) rmIds.add(i.rawMaterialId.toString());
      });
    }

    const rawMaterials = await RawMaterial.find({ _id: { $in: Array.from(rmIds) } }).lean();
    const unverifiedIngredients = [];

    for (const rm of rawMaterials) {
      let entry = null;
      if (rm.name) {
        const escapedName = rm.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedBot = (rm.botanicalName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchConds = [{ ayurvedicName: new RegExp(`^${escapedName}$`, 'i') }];
        if (escapedBot) {
          searchConds.push({ botanicalName: new RegExp(`^${escapedBot}$`, 'i') });
        }
        entry = await PharmacopoeiaEntry.findOne({ $or: searchConds }).lean();
      }

      if (entry && entry.verified === false) {
        unverifiedIngredients.push({
          rawMaterialId: rm._id,
          name: rm.name,
          botanicalName: rm.botanicalName || entry.botanicalName || '',
          monographRef: rm.monographRef || entry.monographRef || '',
          source: entry.source || 'AI-generated'
        });
      }
    }

    if (unverifiedIngredients.length > 0 && req.body.acknowledgeUnverifiedRefs !== true) {
      return res.status(400).json({
        error: 'Batch contains raw materials with unverified pharmacopoeia monograph citations.',
        warning: `Unverified pharmacopoeia monograph citations found for ${unverifiedIngredients.length} ingredient(s). Set acknowledgeUnverifiedRefs: true in request body to proceed.`,
        unverifiedIngredients
      });
    }

    batch.bmrApprovedBy = req.user.id;
    batch.bmrApprovedByName = req.user.name;
    batch.bmrApprovedAt = new Date();

    if (unverifiedIngredients.length > 0) {
      batch.bmrUnverifiedAcknowledged = true;
      batch.bmrUnverifiedAcknowledgedBy = req.user.id;
      batch.bmrUnverifiedAcknowledgedByName = req.user.name;
      batch.bmrUnverifiedAcknowledgedAt = new Date();
    }

    await batch.save();
    if (req.io) {
      req.io.emit('mfg_batch_updated', batch);
    }
    res.json(batch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/stage/:stageIndex — Advance a manufacturing stage
router.patch('/:id/stage/:stageIndex', authorize('manufacturing:edit'), validate(schemas.batchStageUpdateSchema), async (req, res) => {
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

    if (batch.status === 'completed' && batch.qcStatus === 'approved' && batch.releasedBy) {
      return res.status(400).json({ error: 'Released batch records are locked against direct mutation. Use /correct endpoint.' });
    }

    if (stageIndex < 0 || stageIndex >= batch.stages.length) {
      return res.status(400).json({ error: 'Invalid stage index' });
    }

    const stageNameForClearance = String(batch.stages[stageIndex].name || '').toLowerCase();
    if (status && status !== 'pending' && stageIndex > 0) {
      const previousStage = batch.stages[stageIndex - 1];
      const previousDispositionRecorded = ['completed', 'skipped'].includes(previousStage.status);
      const independentlyVerified = previousStage.verifiedBy && previousStage.verifiedAt &&
        previousStage.performedBy && String(previousStage.verifiedBy) !== String(previousStage.performedBy);
      if (!previousDispositionRecorded || !independentlyVerified) {
        return res.status(409).json({
          error: 'The preceding manufacturing stage must be completed or formally skipped and independently verified before this stage can start',
          code: 'PREVIOUS_STAGE_VERIFICATION_REQUIRED',
          previousStageIndex: stageIndex - 1
        });
      }
    }
    if (status === 'skipped' && !String(notes || '').trim()) {
      return res.status(400).json({ error: 'A documented reason is required when a manufacturing stage is skipped', code: 'STAGE_SKIP_REASON_REQUIRED' });
    }
    const requiredClearancePhase = stageNameForClearance.includes('filling') ? 'filling' :
      (stageNameForClearance.includes('packaging') || stageNameForClearance.includes('label')) ? 'packing' : null;
    if (requiredClearancePhase && batch.stages[stageIndex].status === 'pending' && status !== 'pending') {
      const LineClearance = require('../../models/LineClearance');
      const phaseClearance = await LineClearance.findOne({ batchId: batch._id, phase: requiredClearancePhase });
      const c = phaseClearance && phaseClearance.checklist;
      const complete = Boolean(phaseClearance && phaseClearance.cleared === true && phaseClearance.submittedBy &&
        phaseClearance.verifiedBy && String(phaseClearance.submittedBy) !== String(phaseClearance.verifiedBy) &&
        phaseClearance.verifiedAt && phaseClearance.clearedBy && phaseClearance.clearedAt && c &&
        c.equipmentCleaned && c.previousMaterialsRemoved && c.previousLabelsDocumentsRemoved && c.areaVisuallyInspected);
      if (!complete) return res.status(409).json({
        error: 'A completed, independently verified ' + requiredClearancePhase + ' line-clearance checklist is required before this stage can start',
        code: 'STAGE_LINE_CLEARANCE_REQUIRED', phase: requiredClearancePhase
      });
    }

    // A newly created batch stays in draft until both pre-execution BMR approval
    // and a complete, independently recorded manufacturing line clearance exist.
    if (stageIndex === 0 && batch.stages[0].status === 'pending' && status !== 'pending') {
      const LineClearance = require('../../models/LineClearance');
      const clearance = await LineClearance.findOne({ batchId: batch._id, phase: 'manufacturing' });
      const checklist = clearance && clearance.checklist;
      const clearanceComplete = Boolean(clearance && clearance.cleared === true &&
        clearance.submittedBy && clearance.verifiedBy && String(clearance.submittedBy) !== String(clearance.verifiedBy) &&
        clearance.verifiedAt && clearance.clearedBy && clearance.clearedAt && checklist &&
        checklist.equipmentCleaned && checklist.previousMaterialsRemoved &&
        checklist.previousLabelsDocumentsRemoved && checklist.areaVisuallyInspected);
      if (!clearanceComplete) {
        return res.status(400).json({ error: 'A completed, signed manufacturing line-clearance checklist is required before starting production' });
      }
      if (!batch.bmrApprovedBy || !batch.bmrApprovedByName || !batch.bmrApprovedAt) {
        return res.status(400).json({ error: 'Authenticated pre-execution BMR approval is required before starting production' });
      }
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid stage status' });
    }

    const currentStage = batch.stages[stageIndex];
    const newStatus = status || 'completed';
    if (req.body.equipmentId !== undefined) currentStage.equipmentId = req.body.equipmentId;

    if (['completed', 'skipped', 'failed'].includes(newStatus)) {
      if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated operator identity is required to record a manufacturing stage disposition' });
      const TrainingRecord = require('../../models/TrainingRecord');
      const now = new Date();
      const training = await TrainingRecord.findOne({
        userId: req.user.id,
        $or: [{ topic: currentStage.name }, { topic: /GMP|Good Manufacturing Practice/i }],
        trainedOn: { $lte: now }, validUntil: { $gt: now },
        trainedBy: { $nin: ['', null] }, certificateRef: { $nin: ['', null] },
        status: 'verified', verifiedBy: { $ne: req.user.id }, verifiedAt: { $ne: null }
      }).lean();
      if (!training) return res.status(400).json({ error: 'Current, independently verified, relevant GMP or stage-specific training evidence is required before this operator can complete the stage' });
      currentStage.operatorTrainingRecordId = training._id;
      currentStage.operatorTrainingTopic = training.topic;
      if (currentStage.equipmentId) {
        const Equipment = require('../../models/Equipment');
        const equipment = await Equipment.findById(currentStage.equipmentId).lean();
        if (!equipment || equipment.status !== 'active') return res.status(400).json({ error: 'Selected equipment is unavailable or not active' });
        const latestCalibration = (equipment.calibrationLogs || []).slice().sort((x, y) => new Date(y.calibratedOn || 0) - new Date(x.calibratedOn || 0))[0];
        if (!latestCalibration || latestCalibration.status !== 'verified' || !latestCalibration.verifiedBy ||
            !latestCalibration.verifiedAt || String(latestCalibration.calibratedByUser) === String(latestCalibration.verifiedBy) ||
            !latestCalibration.certificateNo || !latestCalibration.certificateRef || !latestCalibration.calibratedByUser ||
            !latestCalibration.nextDue || new Date(latestCalibration.nextDue) <= now ||
            !equipment.calibrationDueDate || new Date(equipment.calibrationDueDate) <= now) {
          return res.status(400).json({ error: 'Current, independently verified calibration certificate evidence is required before this stage can be completed' });
        }
        currentStage.equipmentName = equipment.name;
        currentStage.equipmentCalibrationStatus = 'valid';
        currentStage.equipmentCalibrationCertificateNo = latestCalibration.certificateNo;
      }
    }

    if (newStatus === 'in_progress') {
      currentStage.startedAt = currentStage.startedAt || new Date();
    }
    if (newStatus === 'completed' || newStatus === 'skipped' || newStatus === 'failed') {
      currentStage.completedAt = new Date();
      currentStage.completedBy = req.user.name;
      currentStage.performedBy = req.user.id;
      currentStage.performedByName = req.user.name;
    }
    if (notes !== undefined) {
      currentStage.notes = notes;
    }
    currentStage.status = newStatus;
    if (stageIndex === 0 && newStatus !== 'pending') batch.status = 'in_progress';

    if (req.body.actualYieldQty !== undefined) {
      const actualYieldVal = Number(req.body.actualYieldQty);
      batch.actualYieldQty = actualYieldVal;
      
      if (batch.plannedYields && batch.plannedYields.length > 0) {
        if (batch.plannedYields.length === 1) {
          batch.yields = [{
            productId: batch.plannedYields[0].productId,
            actualYieldQty: actualYieldVal,
            packing: 1,
            size: batch.plannedYields[0].size || ''
          }];
        } else {
          batch.yields = batch.plannedYields.map((py, idx) => ({
            productId: py.productId,
            actualYieldQty: idx === 0 ? actualYieldVal : 0,
            packing: 1,
            size: py.size || ''
          }));
        }
      } else {
        batch.yields = [{
          productId: batch.productId,
          actualYieldQty: actualYieldVal,
          packing: 1,
          size: batch.size || ''
        }];
      }
    }

    if (newStatus === 'failed') {
      // If any stage fails, the entire batch run fails immediately
      batch.status = 'rejected';
      batch.qcStatus = 'rejected';
      batch.actualYieldQty = 0;
      batch.wasteQty = batch.plannedQty;
      batch.variancePercent = -100;
      batch.endDate = new Date();
      batch.qcNotes = `Batch failed at stage [${currentStage.name}]${notes ? ` — Reason: ${notes}` : ''}. QC Inspector / Operator: ${completedBy || 'Operator'}`;
    }

    // Stock is issued only through the independently verified dispensing workflow.
    if (Array.isArray(req.body.stageIngredients) && req.body.stageIngredients.length > 0) {
      return res.status(409).json({ error: 'Direct stage material deduction is disabled. Create and independently verify a material dispensing record first.' });
    }
    if (newStatus === 'completed' && batch.bomSnapshot && Array.isArray(batch.bomSnapshot.ingredients)) {
      const basis = Number(batch.bomSnapshot.formulationBasis || 100);
      const multiplier = basis > 0 ? Number(batch.plannedQty || 0) / basis : 0;
      const requiredLines = batch.bomSnapshot.ingredients.filter(ingredient =>
        ingredient.itemType !== 'packaging' &&
        (ingredient.stageName ? ingredient.stageName === currentStage.name : stageIndex === 0));
      for (const ingredient of requiredLines) {
        const requiredQty = ingredient.qtyRequiredForBatch !== undefined && ingredient.qtyRequiredForBatch !== null
          ? Number(ingredient.qtyRequiredForBatch)
          : Number(ingredient.qtyRequired || 0) * multiplier;
        const consumedQty = (batch.ingredientsConsumed || [])
          .filter(item => String(item.rawMaterialId) === String(ingredient.rawMaterialId) &&
            Number.isInteger(item.stageIndex) && Number(item.stageIndex) === stageIndex)
          .reduce((sum, item) => sum + Number(item.qtyConsumed || 0), 0);
        if (consumedQty + 0.0001 < requiredQty) {
          return res.status(409).json({
            error: 'Required materials must be dispensed and independently verified before this manufacturing stage can be completed',
            code: 'MATERIAL_DISPENSING_REQUIRED',
            rawMaterialId: ingredient.rawMaterialId,
            requiredQty: Number(requiredQty.toFixed(2)),
            verifiedDispensedQty: Number(consumedQty.toFixed(2))
          });
        }
      }
    }

    // If yields submitted at stage completion (e.g. packaging stage freely adjusted split), save them
    if (req.body.yields && Array.isArray(req.body.yields) && req.body.yields.length > 0) {
      batch.yields = req.body.yields.map(y => ({
        productId: y.productId,
        actualYieldQty: Number(y.actualYieldQty) || 0,
        packing: Number(y.packing) || 1,
        size: y.size || ''
      }));
      const totalYield = batch.yields.reduce((s, y) => s + y.actualYieldQty, 0);
      batch.actualYieldQty = totalYield;
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

// PATCH /api/batch-productions/:id/stage/:stageIndex/verify — 4-eye stage verification
router.patch('/:id/stage/:stageIndex/verify', authorize('manufacturing:verify'), async (req, res) => {
  try {
    const stageIndex = parseInt(req.params.stageIndex, 10);
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed' && batch.qcStatus === 'approved' && batch.releasedBy) {
      return res.status(400).json({ error: 'Released batch records are locked against direct mutation' });
    }

    if (stageIndex < 0 || stageIndex >= batch.stages.length) {
      return res.status(400).json({ error: 'Invalid stage index' });
    }

    const stage = batch.stages[stageIndex];
    if (!['completed', 'skipped'].includes(stage.status)) {
      return res.status(400).json({ error: 'Stage must be completed or formally skipped before verification' });
    }

    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated verifier identity is required' });
    const userId = req.user.id.toString();
    const performedById = stage.performedBy ? stage.performedBy.toString() : null;

    if (userId && performedById && userId === performedById) {
      return res.status(400).json({ error: 'Performer cannot verify their own stage — 4-eye verification required' });
    }

    stage.verifiedBy = req.user.id;
    stage.verifiedByName = req.user.name;
    stage.verifiedAt = new Date();

    await batch.save();
    if (req.io) {
      req.io.emit('mfg_stage_updated', batch);
    }
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/complete — Complete batch, record QC and inward finished stock
router.patch('/:id/complete', authorize('manufacturing:complete'), validate(schemas.batchCompleteSchema), async (req, res) => {
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

    let batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed' || batch.status === 'rejected') {
      return res.status(400).json({ error: 'Batch is already completed or rejected' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled batch' });
    }

    // Build the yields list: body yields > stage-saved yields > default fallback
    const yieldsList = yields && Array.isArray(yields) && yields.length > 0 ? yields :
      (batch.yields && batch.yields.length > 0 ? batch.yields.map(y => ({
        productId: y.productId.toString(),
        actualYieldQty: y.actualYieldQty,
        packing: y.packing || 1,
        size: y.size || ''
      })) : [{
        productId: batch.productId.toString(),
        actualYieldQty: valYield,
        packing: packing || 1
      }]);

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

    const allDone = batch.stages.every(s => s.status === 'completed' || s.status === 'skipped');
    if (!allDone) {
      const pending = batch.stages.filter(s => s.status === 'pending' || s.status === 'in_progress').map(s => s.name);
      return res.status(400).json({ error: `Cannot complete batch. Pending stages: ${pending.join(', ')}` });
    }

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Finished-goods storage warehouse was not found.' });
    }

    // Do not consume packaging stock until all preconditions above have passed.
    // A rejected completion attempt must leave packaging inventory untouched.
    if (!batch.packagingDeducted) {
      if (batch.packagingMode === 'self_packed') {
        await deductPackagingMaterials(batch, yieldsList);
      } else {
        batch.packagingDeducted = true;
      }
    }

    // Record a QC disposition only when an explicit decision is supplied.
    const qcDisposition = qcStatus || 'pending';
    if (!['pending', 'approved', 'rejected'].includes(qcDisposition)) {
      return res.status(400).json({ error: 'QC disposition must be pending, approved, or rejected' });
    }
    if (qcDisposition !== 'pending' && (!req.user || !req.user.id || !req.user.name)) {
      return res.status(401).json({ error: 'Authenticated QC analyst identity is required for a QC disposition' });
    }
    batch.qcStatus = qcDisposition;
    batch.qcPassedByUser = qcDisposition === 'pending' ? null : req.user.id;
    batch.qcPassedBy = qcDisposition === 'pending' ? '' : req.user.name;
    batch.jobWorkerCertificateRef = jobWorkerCertificateRef || '';
    batch.coaDocumentRef = coaDocumentRef || '';
    batch.jobWorkCharges = Number(jobWorkCharges) || 0;
    batch.qcParameters = {
      organoleptic: organoleptic || '',
      moistureContent: moistureContent !== undefined ? moistureContent : null,
      moistureLimit: req.body.moistureLimit || '',
      ashValue: ashValue !== undefined ? ashValue : null,
      ashValueLimit: req.body.ashValueLimit || '',
      pHValue: pHValue !== undefined ? pHValue : null,
      pHLimit: req.body.pHLimit || '',
      disintegrationTime: disintegrationTime !== undefined ? disintegrationTime : null,
      disintegrationLimit: req.body.disintegrationLimit || '',
      heavyMetals: heavyMetals || '',
      microbialLimit: microbialLimit || '',
      labReportRef: labReportRef || '',
      testStandardRef: req.body.testStandardRef || ''
    };

    // Calculate yield variance
    const plannedQtyVal = batch.plannedQty || 1;
    const varianceVal = Number((((valYield - plannedQtyVal) / plannedQtyVal) * 100).toFixed(2));

    if (qcStatus === 'approved') {
      const SystemSettings = require('../../models/SystemSettings');
      const settings = await SystemSettings.findOne().lean();
      const tolerance = settings ? (settings.yieldVarianceTolerancePercent || 5) : 5;

      const varianceExceeded = Math.abs(varianceVal) > tolerance;

      let qcLimitBreached = false;
      if (moistureContent !== null && moistureContent !== undefined && req.body.moistureLimit) {
        const match = req.body.moistureLimit.match(/NMT\s*(\d+(?:\.\d+)?)/i);
        if (match && moistureContent > parseFloat(match[1])) qcLimitBreached = true;
      }

      if (varianceExceeded || qcLimitBreached) {
        const hasValidDeviation = batch.deviations && batch.deviations.some(d => d.rootCause && d.correctiveAction);
        if (!hasValidDeviation) {
          return res.status(400).json({
            error: `Out-of-tolerance result (Variance: ${varianceVal}%, Tolerance: ±${tolerance}%) requires a populated deviation record (root cause & corrective action) before approval.`
          });
        }
      }

      // Label reconciliation check for printed BOM ingredients
      if (batch.bomSnapshot && batch.bomSnapshot.ingredients) {
        const printedIngs = batch.bomSnapshot.ingredients.filter(i => i.isPrintedMaterial);
        if (printedIngs.length > 0) {
          for (const ing of printedIngs) {
            const rec = (batch.labelReconciliation || []).find(r => r.rawMaterialId.toString() === ing.rawMaterialId.toString());
            if (!rec) {
              return res.status(400).json({ error: `Label & printed packaging reconciliation required for material ID ${ing.rawMaterialId}` });
            }
            const validSum = Math.abs(rec.qtyIssued - (rec.qtyUsed + rec.qtyDamaged + rec.qtyReturnedToStore)) <= 0.01;
            if (!validSum && !rec.discrepancyNote) {
              return res.status(400).json({ error: `Discrepancy in label reconciliation for "${rec.name}": Issued ${rec.qtyIssued} vs Sum ${rec.qtyUsed + rec.qtyDamaged + rec.qtyReturnedToStore}. Provide a discrepancy note.` });
            }
          }
        }
      }

      // Retention sample check
      const RetentionSample = require('../../models/RetentionSample');
      const sampleCount = await RetentionSample.countDocuments({ batchId: batch._id });
      if (sampleCount === 0) {
        return res.status(400).json({ error: 'At least one reference/retention sample record is required before batch QC approval' });
      }
    }

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

    // Production is completed at the manufacturing house first. The finished goods are
    // therefore received into the manufacturing warehouse, and a SALE CHALLAN-style
    // transfer document is created for the user-selected destination. The Challan is the
    // authoritative document for the subsequent physical transfer.
    const now = new Date();
    const ManufacturingUnit = require('../../models/ManufacturingUnit');
    const { completeProductionReceiptAndCreateTransfer } = require('../../services/challanInventoryService');
    let productionWarehouse = await Warehouse.findOne({ manufacturingUnitId: batch.manufacturingUnitId, type: 'manufacturing' });
    if (!productionWarehouse) {
      productionWarehouse = await Warehouse.findOne({ type: 'manufacturing', name: batch.manufacturingUnitName });
      if (productionWarehouse && !productionWarehouse.manufacturingUnitId) {
        productionWarehouse.manufacturingUnitId = batch.manufacturingUnitId;
        await productionWarehouse.save();
      }
    }
    if (!productionWarehouse) {
      const unit = await ManufacturingUnit.findById(batch.manufacturingUnitId).lean();
      if (!unit) return res.status(404).json({ error: 'Manufacturing unit not found for production stock location.' });
      productionWarehouse = await Warehouse.create({
        name: `${unit.name} — Production House`,
        type: 'manufacturing',
        manufacturingUnitId: unit._id,
        addressLine1: unit.addressLine1 || '',
        city: unit.city || '',
        state: unit.state || '',
        pincode: unit.pincode || '',
        contactPerson: unit.contactPerson || '',
        phone: unit.phone || ''
      });
    }
    if (String(productionWarehouse._id) === String(warehouse._id)) {
      return res.status(400).json({ error: 'Finished-goods destination must be different from the production house.' });
    }
    if (batch.shelfLifeMonths) {
      const exp = new Date(now);
      exp.setMonth(exp.getMonth() + batch.shelfLifeMonths);
      batch.expiryDate = exp;
    }

    const challanItems = yieldItemsWithWeight.map(item => {
      const pct = totalAllocWeight > 0 ? (item.allocWeight / totalAllocWeight) : (1 / yieldItemsWithWeight.length);
      const allocatedCost = totalCost * pct;
      const unitCost = item.actualYieldQty > 0 ? (allocatedCost / Number(item.actualYieldQty)) : 0;
      return {
        productId: item.productId,
        name: item.product.name,
        qty: Number(item.actualYieldQty),
        rate: Number(unitCost.toFixed(2)),
        packing: Number(item.packing) || 1,
        hsnCode: item.product.hsnCode || '',
        gstRate: item.product.gstRate || 0,
        batchNo: batch.batchNo,
        vendorName: 'In-House Production',
        manufacturingUnitId: batch.manufacturingUnitId,
        manufacturingUnitName: batch.manufacturingUnitName
      };
    });

    // The actual finished-goods receipt + transfer Challan creation is performed
    // atomically after all batch validation/cost/backfill work is complete.
    let challan = null;

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
    batch.endDate = now;
    batch.mfgDate = now;

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

    // Backfill: deduct any stage-tied ingredients missed during stage advancement
    // (covers both formulation and packaging that fell through due to the stageName filter bug)
    const backfillIngs = (batch.bomSnapshot?.ingredients || []).filter(i => {
      const hasStage = i.stageName && i.stageName.trim().length > 0;
      const alreadyConsumed = batch.ingredientsConsumed.some(
        c => c.rawMaterialId?.toString() === i.rawMaterialId?.toString()
      );
      return hasStage && !alreadyConsumed;
    });
    let backfillWarehouseId = null;
    if (backfillIngs.length > 0) {
      const manufacturingWarehouseForMaterials = await resolveManufacturingWarehouse(batch.manufacturingUnitId);
      backfillWarehouseId = manufacturingWarehouseForMaterials._id;
    }

    const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
    const challanNo = await generateAtomicDocumentNumber('productionTransferChallanNo', 'CH', 5);
    const completed = await completeProductionReceiptAndCreateTransfer({
      batch,
      challanItems,
      productionWarehouse,
      destinationWarehouse: warehouse,
      challanNo,
      now,
      userId: req.user ? req.user.id : null,
      createdBy: req.user && req.user.name ? req.user.name : 'System',
      backfillIngredients: backfillIngs,
      backfillWarehouseId
    });
    batch = completed.batch;
    challan = completed.challan;
    if (req.io) {
      req.io.emit('mfg_batch_completed', batch);
      req.io.emit('challan_created', challan);
    }
    res.json({ batch, challan: { _id: challan._id, challanNo: challan.challanNo, status: challan.status, challanType: challan.challanType, sourceWarehouseId: challan.warehouseId, sourceWarehouseName: challan.warehouseName, destinationWarehouseId: challan.destinationWarehouseId, destinationWarehouseName: challan.destinationWarehouseName } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/release — Market release approval separate from QC inspection
// PATCH /api/batch-productions/:id/qc-tests — Record actual results against the pinned approved product specification.
router.patch('/:id/qc-tests', authorize('manufacturing:complete'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated QC analyst identity is required to record test results' });
    }
    if (batch.status === 'cancelled' || batch.status === 'rejected' || batch.releasedBy) {
      return res.status(409).json({ error: 'QC test results cannot be added to cancelled, rejected or released batches' });
    }
    const tests = req.body.tests;
    if (!Array.isArray(tests) || tests.length === 0) {
      return res.status(400).json({ error: 'At least one actual QC test result is required' });
    }
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const specificationId = batch.qcSpecificationId || req.body.qcSpecificationId;
    if (!specificationId) {
      return res.status(409).json({ error: 'Select an approved product-specific quality specification before recording QC tests' });
    }
    const spec = await ProductQualitySpecification.findById(specificationId).lean();
    const productId = batch.productId && batch.productId._id ? batch.productId._id : batch.productId;
    if (!spec || spec.status !== 'approved' || String(spec.productId) !== String(productId) ||
      !spec.approvedBy || !spec.approvedAt || (spec.effectiveDate && new Date(spec.effectiveDate) > new Date())) {
      return res.status(409).json({ error: 'QC tests require an effective, approved specification for this exact product' });
    }
    const specTests = new Map((spec.tests || []).map(test => [String(test.code || '').trim().toLowerCase(), test]));
    if (!specTests.size) return res.status(409).json({ error: 'Approved product quality specification has no test requirements' });
    const existingCodes = new Set((batch.qcTests || []).map(test => String(test.code || '').trim().toLowerCase()));
    const submittedCodes = new Set();
    const normalized = [];
    for (const item of tests) {
      const code = String(item.code || '').trim();
      const key = code.toLowerCase();
      const specTest = specTests.get(key);
      if (!code || !specTest) return res.status(400).json({ error: 'Every QC test code must exist in the approved product specification', code });
      if (submittedCodes.has(key) || existingCodes.has(key)) {
        return res.status(409).json({ error: 'A QC result for test ' + code + ' is already recorded; use the controlled QC correction workflow rather than overwriting test history' });
      }
      submittedCodes.add(key);
      const status = String(item.status || 'pending').toLowerCase();
      if (!['pending', 'pass', 'fail'].includes(status)) {
        return res.status(400).json({ error: 'QC test status must be pending, pass or fail', code });
      }
      const hasTextResult = item.result !== undefined && item.result !== null && String(item.result).trim() !== '';
      const hasNumericResult = item.numericResult !== undefined && item.numericResult !== null &&
        Number.isFinite(Number(item.numericResult));
      if (!hasTextResult && !hasNumericResult) {
        return res.status(400).json({ error: 'An actual text or numeric result is required for QC test ' + code });
      }
      normalized.push({
        code: specTest.code,
        name: specTest.name,
        category: specTest.category || 'other',
        specification: specTest.specification,
        unit: specTest.unit || '',
        methodReference: specTest.methodReference || '',
        result: hasTextResult ? String(item.result).trim() : '',
        numericResult: hasNumericResult ? Number(item.numericResult) : null,
        status,
        testedBy: req.user.id,
        testedByName: req.user.name,
        testedAt: new Date(),
        remarks: String(item.remarks || '').trim()
      });
    }
    batch.qcSpecificationId = spec._id;
    batch.qcSpecificationVersion = spec.specificationVersion || '';
    batch.qcTests = (batch.qcTests || []).concat(normalized);
    const allResults = new Map(batch.qcTests.map(test => [String(test.code || '').trim().toLowerCase(), test]));
    const mandatory = (spec.tests || []).filter(test => test.mandatory !== false);
    const failed = batch.qcTests.some(test => String(test.status || '').toLowerCase() === 'fail');
    const mandatoryPassed = mandatory.length > 0 && mandatory.every(test =>
      String((allResults.get(String(test.code || '').trim().toLowerCase()) || {}).status || '').toLowerCase() === 'pass'
    );
    if (failed) {
      batch.qcStatus = 'rejected';
      batch.qcPassedByUser = req.user.id;
      batch.qcPassedBy = req.user.name;
      if (batch.status === 'completed') batch.status = 'qc_hold';
    } else if (mandatoryPassed) {
      batch.qcStatus = 'pending_qa_review';
      batch.qcPassedByUser = req.user.id;
      batch.qcPassedBy = req.user.name;
      batch.qcApprovedByUser = null;
      batch.qcApprovedByName = '';
      batch.qcApprovedAt = null;
      batch.qcApprovalNotes = '';
    } else {
      batch.qcStatus = 'pending';
      batch.qcPassedByUser = null;
      batch.qcPassedBy = '';
      batch.qcApprovedByUser = null;
      batch.qcApprovedByName = '';
      batch.qcApprovedAt = null;
      batch.qcApprovalNotes = '';
    }
    await batch.save();
    if (req.io) req.io.emit('mfg_batch_updated', batch);
    res.json({
      batch,
      qcStatus: batch.qcStatus,
      mandatoryTests: mandatory.length,
      recordedTests: batch.qcTests.length,
      mandatoryTestsPassed: mandatoryPassed,
      deviationRequired: failed,
      message: failed ? 'One or more recorded tests failed. Batch is on QC hold and requires deviation investigation.' :
        (mandatoryPassed ? 'All mandatory tests are recorded as passed. Independent QA disposition approval is now required.' :
          'QC results recorded. Remaining mandatory tests must be completed before QC approval.')
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/qc-approval', authorize('manufacturing:qcApprove'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    const reviewerId = req.user?.id || req.user?._id;
    const reviewerName = req.user?.name || req.user?.email;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    if (!reviewerId || !reviewerName) return res.status(401).json({ error: 'Authenticated QA reviewer identity is required' });
    if (!notes) return res.status(400).json({ error: 'QA disposition review notes are required' });
    if (batch.qcStatus !== 'pending_qa_review') return res.status(409).json({ error: 'Only QC dispositions pending QA review can be approved' });
    if (!batch.qcPassedByUser || String(batch.qcPassedByUser) === String(reviewerId)) {
      return res.status(409).json({ error: 'QC analyst cannot independently approve their own test disposition' });
    }
    if (batch.status !== 'completed' || batch.releasedBy) return res.status(409).json({ error: 'Only completed, unreleased batches can receive QA disposition approval' });
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const spec = await ProductQualitySpecification.findById(batch.qcSpecificationId).lean();
    const batchProductId = batch.productId && batch.productId._id ? batch.productId._id : batch.productId;
    if (!spec || spec.status !== 'approved' || !spec.approvedBy || !spec.approvedAt ||
      String(spec.productId) !== String(batchProductId) ||
      (spec.effectiveDate && new Date(spec.effectiveDate) > new Date())) {
      return res.status(409).json({ error: 'An effective, approved specification with approval evidence for this exact product is required for QA disposition review' });
    }
    if (String(batch.qcSpecificationVersion || '') !== String(spec.specificationVersion || '')) {
      return res.status(409).json({ error: 'The batch QC specification version does not match the approved specification record' });
    }
    const results = new Map((batch.qcTests || []).map(test => [String(test.code || '').trim().toLowerCase(), test]));
    const mandatory = (spec.tests || []).filter(test => test.mandatory !== false);
    const allPassed = mandatory.length > 0 && mandatory.every(test => {
      const result = results.get(String(test.code || '').trim().toLowerCase());
      return result && result.status === 'pass' && (String(result.result || '').trim() || Number.isFinite(result.numericResult));
    });
    if (!allPassed || (batch.qcTests || []).some(test => test.status === 'fail')) {
      return res.status(409).json({ error: 'All mandatory tests must have actual passing results and no recorded test may have failed' });
    }
    batch.qcStatus = 'approved';
    batch.qcApprovedByUser = reviewerId;
    batch.qcApprovedByName = reviewerName;
    batch.qcApprovedAt = new Date();
    batch.qcApprovalNotes = notes;
    await batch.save();
    req.io?.emit('mfg_batch_updated', batch);
    return res.json({ batch, message: 'Independent QA disposition approved; separate market release approval is still required' });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

router.patch('/:id/release', authorize('manufacturing:release'), async (req, res) => {
  try {
    let batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated independent QA releaser identity is required' });
    }
    if (batch.status !== 'completed' || batch.qcStatus !== 'approved') {
      return res.status(400).json({ error: 'Batch must be completed and QC approved before market release' });
    }
    if (!batch.bmrApprovedBy || !batch.bmrApprovedAt) {
      return res.status(400).json({ error: 'Pre-execution BMR approval is required before market release' });
    }
    if (!batch.qcPassedByUser || !batch.qcPassedBy) {
      return res.status(400).json({ error: 'Identified QC analyst disposition is required before market release' });
    }
    if (String(batch.qcPassedByUser) === String(req.user.id)) {
      return res.status(409).json({ error: 'Independent QA release is required; the QC analyst cannot release the same batch' });
    }
    const criticalStages = (batch.stages || []).filter(s => s.name !== 'QC Testing');
    if (criticalStages.some(s => s.status !== 'completed' && s.status !== 'skipped')) return res.status(400).json({ error: 'All critical manufacturing stages must be completed or formally skipped before market release' });
    if (criticalStages.some(s => ['completed', 'skipped'].includes(s.status) &&
      (!s.performedBy || !s.verifiedBy || !s.verifiedAt || String(s.performedBy) === String(s.verifiedBy)))) {
      return res.status(400).json({ error: 'Every completed or skipped critical manufacturing stage requires independent operator and verifier identities with verification timestamp before market release' });
    }
    if (criticalStages.some(s => s.status === 'skipped' && !String(s.notes || '').trim())) {
      return res.status(400).json({ error: 'Every skipped critical manufacturing stage requires a documented reason before market release' });
    }
    if (criticalStages.some(s => s.status === 'completed' && !s.isDualSigned)) return res.status(400).json({ error: 'Every completed critical manufacturing stage must have independent Chemist and QA signatures' });
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const LineClearance = require('../../models/LineClearance');
    const spec = batch.qcSpecificationId ? await ProductQualitySpecification.findById(batch.qcSpecificationId).lean() : null;
    const productId = batch.productId && batch.productId._id ? batch.productId._id : batch.productId;
    if (!spec || spec.status !== 'approved' || String(spec.productId) !== String(productId) ||
      !spec.approvedBy || !spec.approvedAt || (spec.effectiveDate && new Date(spec.effectiveDate) > new Date())) {
      return res.status(400).json({ error: 'An effective, approved product-specific quality specification with approval evidence is required before market release' });
    }
    const mandatory = (spec.tests || []).filter(t => t.mandatory !== false);
    if (!mandatory.length) return res.status(400).json({ error: 'Approved product quality specification has no mandatory test requirements' });
    const results = batch.qcTests || [];
    if (results.some(test => String(test.status || '').toLowerCase() === 'fail')) return res.status(400).json({ error: 'A failed finished-product QC test prevents market release; investigate the deviation and document disposition' });
    const missing = mandatory.filter(t => {
      const result = results.find(x => String(x.code) === String(t.code));
      return !result || String(result.status || '').toLowerCase() !== 'pass' ||
        !result.testedBy || !result.testedByName || !result.testedAt ||
        ((result.result === undefined || result.result === null || String(result.result).trim() === '') &&
          (result.numericResult === undefined || result.numericResult === null));
    });
    if (missing.length) return res.status(400).json({
      error: 'Mandatory QC tests must have passed with tester identity, timestamp and recorded result',
      tests: missing.map(t => t.code)
    });
    const qaIsTestAnalyst = results.some(result => result.testedBy && String(result.testedBy) === String(req.user.id));
    if (qaIsTestAnalyst) {
      return res.status(409).json({ error: 'Independent QA release is required; a QC test analyst cannot release the same batch' });
    }
    const clearances = await LineClearance.find({ batchId: batch._id }).lean();
    const MaterialDispensing = require('../../models/MaterialDispensing');
    const dispensingRecords = await MaterialDispensing.find({ batchId: batch._id }).lean();
    const materialGenealogyIssues = getMaterialGenealogyIssues(batch, dispensingRecords);
    if (materialGenealogyIssues.length) return res.status(400).json({
      error: 'Batch material genealogy and formula reconciliation must be complete before market release',
      code: 'MATERIAL_GENEALOGY_INCOMPLETE',
      missingEvidence: materialGenealogyIssues
    });
    for (const phase of ['manufacturing','filling','packing']) {
      const c = clearances.find(x => x.phase === phase);
      if (!c || !c.cleared || !c.submittedBy || !c.verifiedBy ||
        String(c.submittedBy) === String(c.verifiedBy) || !c.verifiedAt || !c.clearedBy || !c.clearedAt ||
        !c.checklist?.equipmentCleaned || !c.checklist?.previousMaterialsRemoved ||
        !c.checklist?.previousLabelsDocumentsRemoved || !c.checklist?.areaVisuallyInspected) {
        return res.status(400).json({ error: `Approved ${phase} line clearance with reviewer identity and timestamp is required before market release` });
      }
    }

    if (batch.releasedBy) return res.status(409).json({ error: 'Batch has already received independent market release' });
    const releasedAt = new Date();
    batch = await withTransaction(async session => {
      const current = await BatchProduction.findOne({
        _id: batch._id, updatedAt: batch.updatedAt, status: 'completed', qcStatus: 'approved',
        $or: [{ releasedBy: null }, { releasedBy: { $exists: false } }]
      }).session(session);
      if (!current) throw Object.assign(new Error('Batch was released or changed concurrently; refresh and retry'), { code: 'BATCH_RELEASE_CONFLICT' });
      current.releasedBy = req.user.id;
      current.releasedByName = req.user.name;
      current.releasedAt = releasedAt;
      await current.save({ session });
      await InventoryEntry.updateMany(
        { productionBatchId: current._id, marketReleased: false },
        { $set: { marketReleased: true, marketReleasedAt: releasedAt, marketReleasedBy: req.user.id } },
        { session }
      );
      return current;
    });

    if (req.io) {
      req.io.emit('mfg_batch_released', batch);
    }

    res.json(batch);
  } catch (err) {
    res.status(err.code === 'BATCH_RELEASE_CONFLICT' ? 409 : 500).json({ error: err.message, code: err.code });
  }
});

// PATCH /api/batch-productions/:id/correct — Controlled audit correction for released batches
router.patch('/:id/correct', authorize('manufacturing:correctReleased'), async (req, res) => {
  try {
    const { reason, updates } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A mandatory justification reason is required to correct a released batch' });
    }

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    const AuditLog = require('../../models/AuditLog');
    await AuditLog.create({
      action: 'CORRECT_RELEASED_BATCH',
      resource: 'BatchProduction',
      resourceId: batch._id,
      userId: req.user ? req.user.id : null,
      userName: req.user ? req.user.name : 'Admin',
      details: {
        batchNo: batch.batchNo,
        reason,
        previousState: {
          qcNotes: batch.qcNotes,
          notes: batch.notes
        },
        requestedUpdates: updates
      }
    });

    if (updates && typeof updates === 'object') {
      if (updates.qcNotes !== undefined) batch.qcNotes = updates.qcNotes;
      if (updates.notes !== undefined) batch.notes = updates.notes;
    }

    await batch.save();
    res.json({ message: 'Controlled audit correction applied successfully', batch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/cancel — Cancel active production run, revert raw materials stock
router.patch('/:id/cancel', idempotency, authorize('manufacturing:edit'), validate(schemas.batchCancelSchema), async (req, res) => {
  try {
    const batch = await withTransaction(async session => {
      const current = await BatchProduction.findById(req.params.id).session(session);
      if (!current) throw Object.assign(new Error('Batch production run not found'), { status: 404, code: 'BATCH_NOT_FOUND' });
      if (current.status === 'completed') throw Object.assign(new Error('Cannot cancel a completed batch'), { status: 400, code: 'BATCH_COMPLETED' });
      if (current.status === 'cancelled') throw Object.assign(new Error('Batch is already cancelled'), { status: 409, code: 'BATCH_ALREADY_CANCELLED' });

      for (let idx = 0; idx < (current.ingredientsConsumed || []).length; idx += 1) {
        const item = current.ingredientsConsumed[idx];
        const entry = await RawMaterialEntry.findById(item.rawMaterialEntryId).session(session);
        if (!entry) throw Object.assign(new Error(`Consumed raw-material entry ${item.rawMaterialEntryId} no longer exists; reconcile before cancelling`), { status: 409, code: 'RAW_MATERIAL_ENTRY_NOT_FOUND' });
        entry.qty = Number(entry.qty || 0) + Number(item.qtyConsumed || 0);
        await entry.save({ session });
        await RawMaterialLedger.create([{
          rawMaterialId: item.rawMaterialId,
          warehouseId: entry.warehouseId,
          warehouseName: entry.warehouseName || '',
          type: 'IN',
          qty: Number(item.qtyConsumed || 0),
          balance: entry.qty,
          reference: `BATCH-CANCEL:${current.batchNo}`,
          movementKey: `batch-cancel:${current._id}:${idx}`,
          note: `Raw material restored after cancelling batch ${current.batchNo}`,
          createdBy: req.user?.name || 'System',
          batchNo: entry.batchNo || '',
        }], { session });
      }

      current.stages.forEach(s => {
        if (s.status === 'in_progress') { s.status = 'pending'; s.startedAt = null; }
      });
      current.status = 'cancelled';
      current.endDate = new Date();
      await current.save({ session });
      return current;
    });

    if (req.io) {
      req.io.emit('mfg_batch_cancelled', { batchNo: batch.batchNo, id: batch._id });
      req.io.emit('inventory_updated', { type: 'batch_cancelled', batchNo: batch.batchNo });
    }
    await logAction({ action: 'BATCH_CANCELLED', description: `Cancelled batch ${batch.batchNo} and restored consumed raw materials`, details: { id: batch._id, batchNo: batch.batchNo }, req });
    res.json(batch);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'BATCH_CANCEL_FAILED' });
  }
});

// GET /api/batch-productions/genealogy/search — Search genealogy by Finished Goods Batch No or Raw Material Batch No
router.get('/genealogy/search', authorize('manufacturing:view'), async (req, res) => {
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
          qcStatus: fb.qcStatus || 'pending',
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
router.get('/:id/genealogy', authorize('manufacturing:view'), async (req, res) => {
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
      qcStatus: batch.qcStatus || 'pending',
      qcParameters: batch.qcParameters || null,
      ingredients: enrichedIngredients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/bmr-report — System-generated internal batch manufacturing record.
router.get('/:id/bmr-report', authorize('manufacturing:view'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id)
      .populate('productId')
      .populate('ingredientsConsumed.rawMaterialId')
      .lean();
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const SystemSettings = require('../../models/SystemSettings');
    const LineClearance = require('../../models/LineClearance');
    const RetentionSample = require('../../models/RetentionSample');
    const MaterialDispensing = require('../../models/MaterialDispensing');
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const PharmacopoeiaEntry = require('../../models/PharmacopoeiaEntry');
    const settings = await SystemSettings.findOne().lean() || {};
    const [lineClearance, retentionSamples, dispensingRecords, qualitySpecification] = await Promise.all([
      LineClearance.find({ batchId: batch._id }).lean(),
      RetentionSample.find({ batchId: batch._id }).lean(),
      MaterialDispensing.find({ batchId: batch._id }).sort({ stageIndex: 1, dispensedAt: 1 }).lean(),
      batch.qcSpecificationId ? ProductQualitySpecification.findById(batch.qcSpecificationId).lean() : Promise.resolve(null)
    ]);

    const enrichedIngredients = [];
    const unverifiedIngredients = [];
    const missingPharmacopoeiaReferences = [];
    for (const ing of (batch.ingredientsConsumed || [])) {
      const entry = ing.rawMaterialEntryId ? await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean() : null;
      const rm = ing.rawMaterialId || {};
      let pharmacopoeiaEntry = null;
      if (rm.name) {
        const escapedName = rm.name.trim().replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
        const escapedBot = (rm.botanicalName || '').trim().replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
        const searchConds = [{ ayurvedicName: new RegExp('^' + escapedName + '$', 'i') }];
        if (escapedBot) searchConds.push({ botanicalName: new RegExp('^' + escapedBot + '$', 'i') });
        pharmacopoeiaEntry = await PharmacopoeiaEntry.findOne({ $or: searchConds }).lean();
      }
      const referenceVerified = Boolean(pharmacopoeiaEntry && pharmacopoeiaEntry.verified === true);
      if (!pharmacopoeiaEntry) {
        missingPharmacopoeiaReferences.push({ rawMaterialId: rm._id || ing.rawMaterialId || null, name: rm.name || null });
      } else if (!referenceVerified) {
        unverifiedIngredients.push({
          rawMaterialId: rm._id || ing.rawMaterialId || null,
          name: rm.name || null,
          botanicalName: pharmacopoeiaEntry.botanicalName || rm.botanicalName || null,
          monographRef: pharmacopoeiaEntry.monographRef || rm.monographRef || null,
          source: pharmacopoeiaEntry.source || null
        });
      }
      const purchaseRate = entry && Number.isFinite(Number(entry.purchaseRate)) ? Number(entry.purchaseRate) : null;
      enrichedIngredients.push({
        name: rm.name || null,
        botanicalName: rm.botanicalName || (referenceVerified ? pharmacopoeiaEntry.botanicalName : null),
        partUsed: rm.partUsed || (referenceVerified ? pharmacopoeiaEntry.partUsed || null : null),
        pharmacopoeialStandard: rm.pharmacopoeialStandard || (referenceVerified ? pharmacopoeiaEntry.pharmacopoeialStandard || null : null),
        monographRef: rm.monographRef || (referenceVerified ? pharmacopoeiaEntry.monographRef || null : null),
        pharmacopoeiaReference: pharmacopoeiaEntry ? {
          source: pharmacopoeiaEntry.source || null,
          verified: referenceVerified,
          standard: referenceVerified ? pharmacopoeiaEntry.pharmacopoeialStandard || null : null,
          monographRef: pharmacopoeiaEntry.monographRef || null
        } : null,
        isScheduleE1: rm.isScheduleE1 === true,
        code: rm.sku || rm.code || null,
        rawMaterialId: rm._id || ing.rawMaterialId || null,
        rawMaterialEntryId: ing.rawMaterialEntryId || null,
        stockLotNo: entry ? entry.batchNo || null : ing.batchNo || null,
        batchNo: ing.batchNo || (entry ? entry.batchNo || null : null),
        qtyConsumed: Number.isFinite(Number(ing.qtyConsumed)) ? Number(ing.qtyConsumed) : null,
        qtyWasted: Number.isFinite(Number(ing.qtyWasted)) ? Number(ing.qtyWasted) : 0,
        wastageReason: ing.wastageReason || null,
        unit: rm.unit || null,
        purchaseRate,
        itemCost: purchaseRate === null ? null : Number((Number(ing.qtyConsumed || 0) * purchaseRate).toFixed(2)),
        stageIndex: ing.stageIndex ?? null,
        dispensingNo: ing.dispensingNo || null
      });
    }

    const product = batch.productId || null;
    const yieldProdIds = new Set();
    (batch.plannedYields || []).forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    (batch.yields || []).forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    const yieldProducts = yieldProdIds.size > 0
      ? await Product.find({ _id: { $in: [...yieldProdIds] } }).select('name size sku category').lean()
      : [];
    const yieldProdMap = {};
    yieldProducts.forEach(p => { yieldProdMap[p._id.toString()] = p; });

    const mandatoryQcTests = qualitySpecification && qualitySpecification.status === 'approved'
      ? (qualitySpecification.tests || []).filter(test => test.mandatory !== false)
      : [];
    const qcTests = batch.qcTests || [];
    const qcTestsByCode = new Map(qcTests.map(test => [String(test.code || '').trim().toLowerCase(), test]));
    const missingEvidence = [];
    if (!batch.bomSnapshot || !Array.isArray(batch.bomSnapshot.ingredients) || batch.bomSnapshot.ingredients.length === 0) {
      missingEvidence.push('Pinned batch formula snapshot is missing');
    }
    if (!batch.bmrApprovedBy || !batch.bmrApprovedByName || !batch.bmrApprovedAt) missingEvidence.push('Pre-execution BMR approval identity or timestamp is missing');
    missingEvidence.push(...getMaterialGenealogyIssues(batch, dispensingRecords));
    if (missingPharmacopoeiaReferences.length) missingEvidence.push('One or more consumed materials lack a pharmacopoeia reference record');
    if (unverifiedIngredients.length) missingEvidence.push('One or more pharmacopoeia references are not verified');
    if (!batch.stages || batch.stages.length === 0) missingEvidence.push('Manufacturing stage execution records are missing');
    else {
      for (const stage of batch.stages) {
        if (!['completed', 'skipped'].includes(stage.status)) missingEvidence.push('Stage is not completed or formally skipped: ' + stage.name);
        if (stage.status === 'completed' && (!stage.performedBy || !stage.performedByName)) missingEvidence.push('Stage operator identity is missing: ' + stage.name);
        if (stage.status === 'completed' && (!stage.equipmentId || stage.equipmentCalibrationStatus !== 'valid')) missingEvidence.push('Verified equipment calibration evidence is missing: ' + stage.name);
        if (['completed', 'skipped'].includes(stage.status) &&
          (!stage.performedBy || !stage.verifiedBy || !stage.verifiedAt ||
           String(stage.performedBy) === String(stage.verifiedBy))) {
          missingEvidence.push('Independent four-eye stage verification is missing: ' + stage.name);
        }
        if (stage.status === 'skipped' && !String(stage.notes || '').trim()) missingEvidence.push('Documented reason for skipped stage is missing: ' + stage.name);
        if (stage.status === 'completed' && !stage.operatorTrainingRecordId) missingEvidence.push('Operator training evidence is missing: ' + stage.name);
      }
    }
    for (const phase of ['manufacturing', 'filling', 'packing']) {
      const verifiedClearance = lineClearance.some(record => record.phase === phase && record.cleared === true &&
        record.submittedBy && record.verifiedBy && String(record.submittedBy) !== String(record.verifiedBy) &&
        record.verifiedAt && record.clearedBy && record.clearedAt && record.checklist &&
        record.checklist.equipmentCleaned && record.checklist.previousMaterialsRemoved &&
        record.checklist.previousLabelsDocumentsRemoved && record.checklist.areaVisuallyInspected);
      if (!verifiedClearance) missingEvidence.push('Verified ' + phase + ' line-clearance record is missing or incomplete');
    }
    if (!qualitySpecification || qualitySpecification.status !== 'approved' ||
      String(qualitySpecification.productId) !== String(product ? product._id : batch.productId) ||
      !qualitySpecification.approvedBy || !qualitySpecification.approvedAt ||
      (qualitySpecification.effectiveDate && new Date(qualitySpecification.effectiveDate) > new Date())) {
      missingEvidence.push('Effective, approved product-specific quality specification is missing');
    }
    if (!mandatoryQcTests.length) missingEvidence.push('Approved quality specification has no mandatory test requirements');
    for (const specTest of mandatoryQcTests) {
      const recorded = qcTestsByCode.get(String(specTest.code || '').trim().toLowerCase());
      if (!recorded) missingEvidence.push('Mandatory finished-product QC test is not recorded: ' + specTest.code);
      else if (!['pass', 'fail'].includes(String(recorded.status || '').toLowerCase()) ||
        !recorded.testedBy || !recorded.testedByName || !recorded.testedAt ||
        ((recorded.result === undefined || recorded.result === null || String(recorded.result).trim() === '') &&
        (recorded.numericResult === undefined || recorded.numericResult === null))) {
        missingEvidence.push('Finished-product QC test evidence is incomplete: ' + specTest.code);
      }
    }
    if (batch.qcStatus !== 'approved') missingEvidence.push('Finished-product QC approval is not recorded');
    if ((batch.qcTests || []).some(test => String(test.status || '').toLowerCase() === 'fail')) missingEvidence.push('One or more finished-product QC tests have failed');
    if (!batch.releasedBy || !batch.releasedByName || !batch.releasedAt) missingEvidence.push('Independent finished-batch QA release is missing');
    if (batch.actualYieldQty === undefined || batch.actualYieldQty === null) missingEvidence.push('Actual batch yield is not recorded');
    if (Number(batch.wasteQty || 0) > 0 && !batch.wasteReason) missingEvidence.push('Recorded production wastage has no reason');
    if (!retentionSamples.length) missingEvidence.push('Batch retention-sample record is missing');
    if (batch.packagingMode === 'self_packed' && (!batch.labelReconciliation || !batch.labelReconciliation.length ||
      batch.labelReconciliation.some(item => !item.reconciled || item.auditStatus !== 'passed'))) {
      missingEvidence.push('Self-packed batch packaging reconciliation is missing or incomplete');
    }
    const hasUnverifiedReferences = unverifiedIngredients.length > 0;
    const bmrComplete = missingEvidence.length === 0;
    res.json({
      documentType: 'system_generated_batch_manufacturing_record',
      title: 'BATCH MANUFACTURING RECORD — INTERNAL SYSTEM-GENERATED RECORD',
      notice: 'This is an internal system-generated batch record, not an official statutory form, government certificate, GMP certificate, or regulatory approval. Completeness reflects only evidence currently recorded in this system.',
      officialStatutoryForm: false,
      documentStatus: bmrComplete ? 'READY_FOR_QA_REVIEW' : 'DRAFT_INCOMPLETE',
      bmrComplete,
      missingEvidence,
      generatedAt: new Date().toISOString(),
      batchNo: batch.batchNo || null,
      hasUnverifiedReferences,
      unverifiedIngredients,
      missingPharmacopoeiaReferences,
      organizationDetails: {
        firmName: settings.firmName || null,
        firmAddress: settings.firmAddress || null,
        manufacturingLicenseNo: settings.manufacturingLicenseNo || null,
        gmpCertificateNo: settings.gmpCertificateNo || null,
        stateUtCode: settings.stateUtCode || null
      },
      productDetails: {
        name: product ? product.name || null : null,
        sku: product ? product.sku || null : null,
        price: product && product.price !== undefined ? product.price : null,
        size: product ? product.size || null : null,
        category: product ? product.category || null : null
      },
      plannedQty: batch.plannedQty ?? null,
      actualYieldQty: batch.actualYieldQty ?? null,
      mfgDate: batch.mfgDate || null,
      expiryDate: batch.expiryDate || null,
      shelfLifeMonths: batch.shelfLifeMonths ?? null,
      bmrApproval: {
        userId: batch.bmrApprovedBy || null,
        name: batch.bmrApprovedByName || null,
        approvedAt: batch.bmrApprovedAt || null
      },
      independentQaRelease: batch.releasedBy && batch.releasedByName && batch.releasedAt
        ? { userId: batch.releasedBy, name: batch.releasedByName, releasedAt: batch.releasedAt }
        : null,
      plannedYields: (batch.plannedYields || []).map(y => ({
        productId: y.productId ? y.productId.toString() : null,
        plannedQty: y.plannedQty ?? null,
        size: y.size || (y.productId ? (yieldProdMap[y.productId.toString()]?.size || null) : null),
        productName: y.productId ? (yieldProdMap[y.productId.toString()]?.name || null) : null
      })),
      yields: (batch.yields || []).map(y => ({
        productId: y.productId ? y.productId.toString() : null,
        actualYieldQty: y.actualYieldQty ?? null,
        packing: y.packing ?? null,
        size: y.size || (y.productId ? (yieldProdMap[y.productId.toString()]?.size || null) : null),
        productName: y.productId ? (yieldProdMap[y.productId.toString()]?.name || null) : null
      })),
      wasteQty: batch.wasteQty ?? null,
      wasteReason: batch.wasteReason || null,
      variancePercent: batch.variancePercent ?? null,
      batchStatus: batch.status || null,
      startDate: batch.startDate || null,
      endDate: batch.endDate || null,
      qcNotes: batch.qcNotes || null,
      qcPassedBy: batch.qcPassedBy || null,
      qcStatus: batch.qcStatus || null,
      qcParameters: batch.qcParameters || null,
      qcSpecification: qualitySpecification ? {
        id: qualitySpecification._id,
        version: qualitySpecification.specificationVersion || null,
        status: qualitySpecification.status || null,
        approvedBy: qualitySpecification.approvedBy || null,
        approvedAt: qualitySpecification.approvedAt || null
      } : null,
      qcTests,
      rawMaterialCost: batch.rawMaterialCost ?? null,
      overheadCost: batch.overheadCost ?? null,
      unitProductionCost: batch.unitProductionCost ?? null,
      stages: batch.stages || [],
      ingredients: enrichedIngredients,
      bomSnapshot: batch.bomSnapshot || null,
      materialDispensingRecords: dispensingRecords || [],
      lineClearance: lineClearance || [],
      labelReconciliation: batch.labelReconciliation || [],
      retentionSamples: retentionSamples || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/coa — evidence-based internal QC summary, never an official certificate.
router.get('/:id/coa', authorize('manufacturing:view'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id).populate('productId').lean();
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
    const product = batch.productId || {};
    const approvedSpec = batch.qcSpecificationId
      ? await ProductQualitySpecification.findById(batch.qcSpecificationId).lean()
      : null;
    const now = new Date();
    const specMatchesProduct = Boolean(approvedSpec &&
      String(approvedSpec.productId) === String(product._id || batch.productId));
    const specApproved = Boolean(specMatchesProduct && approvedSpec.status === 'approved' &&
      approvedSpec.approvedBy && approvedSpec.approvedAt &&
      (!approvedSpec.effectiveDate || new Date(approvedSpec.effectiveDate) <= now));
    const requiredTests = specApproved && Array.isArray(approvedSpec.tests)
      ? approvedSpec.tests.filter(test => test.mandatory !== false)
      : [];
    const recordedTests = Array.isArray(batch.qcTests) ? batch.qcTests : [];
    const recordedByCode = new Map(recordedTests.map(test => [String(test.code || '').trim().toLowerCase(), test]));
    const requiredResults = requiredTests.map(specTest => {
      const recorded = recordedByCode.get(String(specTest.code || '').trim().toLowerCase());
      if (!recorded) return {
        code: specTest.code, parameter: specTest.name, category: specTest.category || '',
        specification: specTest.specification || '', methodReference: specTest.methodReference || '',
        unit: specTest.unit || '', result: null, numericResult: null, status: 'NOT_RECORDED',
        testedBy: null, testedByUser: null, testedAt: null, remarks: ''
      };
      return {
        code: recorded.code, parameter: recorded.name, category: recorded.category || specTest.category || '',
        specification: specTest.specification || '', methodReference: specTest.methodReference || recorded.methodReference || '',
        result: recorded.result === undefined ? null : recorded.result,
        numericResult: recorded.numericResult === undefined ? null : recorded.numericResult,
        unit: recorded.unit || specTest.unit || '',
        status: String(recorded.status || 'not_tested').toLowerCase(),
        testedBy: recorded.testedByName || null, testedByUser: recorded.testedBy || null,
        testedAt: recorded.testedAt || null, remarks: recorded.remarks || ''
      };
    });
    const requiredCodes = new Set(requiredTests.map(test => String(test.code || '').trim().toLowerCase()));
    const additionalResults = recordedTests
      .filter(test => !requiredCodes.has(String(test.code || '').trim().toLowerCase()))
      .map(test => ({
        code: test.code, parameter: test.name, category: test.category || '',
        specification: test.specification || '', methodReference: test.methodReference || '',
        result: test.result === undefined ? null : test.result,
        numericResult: test.numericResult === undefined ? null : test.numericResult,
        unit: test.unit || '', status: String(test.status || 'not_tested').toLowerCase(),
        testedBy: test.testedByName || null, testedByUser: test.testedBy || null,
        testedAt: test.testedAt || null, remarks: test.remarks || ''
      }));
    const testResults = requiredResults.concat(additionalResults);
    const missingEvidence = [];
    if (!approvedSpec || !specMatchesProduct || !specApproved) {
      missingEvidence.push('An effective, approved product-specific quality specification with approval identity and timestamp is required');
    }
    if (specApproved && requiredTests.length === 0) {
      missingEvidence.push('The approved quality specification contains no mandatory test requirements');
    }
    if (!testResults.length) missingEvidence.push('No specification-linked batch QC test results are recorded');
    for (const test of requiredResults) {
      const hasResult = test.result !== null && test.result !== undefined && String(test.result).trim() !== '';
      if (test.status === 'NOT_RECORDED') missingEvidence.push('Required QC test not recorded: ' + test.code);
      else if (!hasResult && (test.numericResult === null || test.numericResult === undefined)) missingEvidence.push('QC result value is missing: ' + test.code);
      if (!['pass', 'fail'].includes(test.status)) missingEvidence.push('QC disposition is incomplete: ' + test.code);
      if (!test.testedBy || !test.testedByUser || !test.testedAt) missingEvidence.push('QC tester identity or timestamp is missing: ' + test.code);
    }
    if (!batch.qcPassedBy || !batch.qcPassedByUser) missingEvidence.push('Identified QC analyst disposition is missing');
    if (batch.qcStatus !== 'approved') missingEvidence.push('Batch QC disposition is not recorded as approved');
    if (!batch.releasedBy || !batch.releasedByName || !batch.releasedAt) missingEvidence.push('Independent finished-batch QA release evidence is missing');
    const hasFailedTest = testResults.some(test => test.status === 'fail') || batch.qcStatus === 'rejected';
    const mandatoryTestsPassed = requiredResults.length > 0 && requiredResults.every(test => test.status === 'pass');
    const qcEvidenceReady = specApproved && requiredTests.length > 0 && mandatoryTestsPassed &&
      Boolean(batch.qcPassedBy && batch.qcPassedByUser) && batch.qcStatus === 'approved';
    const qaReleaseRecorded = Boolean(batch.releasedBy && batch.releasedByName && batch.releasedAt);
    const overallResult = hasFailedTest ? 'REJECTED' : (qcEvidenceReady && qaReleaseRecorded ? 'PASS' : 'PENDING');
    res.json({
      documentType: 'system_generated_qc_summary',
      title: 'BATCH QC TEST SUMMARY — NOT A CERTIFICATE OF ANALYSIS',
      notice: 'System-generated internal QC summary only. It is not a statutory Certificate of Analysis, laboratory certificate, government-issued certificate, or market-release authorisation.',
      officialCertificate: false,
      requiresAuthorisedQASignature: true,
      documentStatus: hasFailedTest ? 'REJECTED' : (qcEvidenceReady ? (qaReleaseRecorded ? 'RELEASE_RECORDED' : 'READY_FOR_QA_REVIEW') : 'INCOMPLETE'),
      overallResult,
      qcEvidenceReady,
      qaReleaseRecorded,
      missingEvidence,
      batchDetails: {
        batchNo: batch.batchNo || null,
        productName: product.name || null,
        productSku: product.sku || null,
        plannedQuantity: batch.plannedQty ?? null,
        actualYieldQuantity: batch.actualYieldQty ?? null,
        manufacturingDate: batch.mfgDate || null,
        expiryDate: batch.expiryDate || null,
        specificationId: batch.qcSpecificationId || null,
        specificationVersion: specApproved ? approvedSpec.specificationVersion : null,
        pharmacopoeialStandard: specApproved ? approvedSpec.pharmacopoeialStandard : null,
        monographReference: specApproved ? approvedSpec.monographReference || null : null
      },
      testResults,
      recordedQcDisposition: batch.qcStatus || null,
      qcAnalyst: batch.qcPassedBy ? { name: batch.qcPassedBy, userId: batch.qcPassedByUser || null } : null,
      independentQaRelease: qaReleaseRecorded
        ? { userId: batch.releasedBy, name: batch.releasedByName, releasedAt: batch.releasedAt }
        : null,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/documents — Add a supporting document
router.patch('/:id/documents', authorize('manufacturing:edit'), validate(schemas.batchDocumentAddSchema), async (req, res) => {
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
router.delete('/:id/documents', authorize('manufacturing:edit'), validate(schemas.batchDocumentRemoveSchema), async (req, res) => {
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

// GET /api/batch-productions/analytics/yield-variance — Yield vs Planned Variance Dashboard
router.get('/analytics/yield-variance', authorize('manufacturing:view'), async (req, res) => {
  try {
    const batches = await BatchProduction.find({ status: { $in: ['released', 'completed', 'qc_passed'] } })
      .populate('productId', 'name sku')
      .sort({ endDate: -1 })
      .lean();

    let totalPlanned = 0;
    let totalActual = 0;
    const batchMetrics = batches.map(b => {
      const planned = b.plannedQty || 1;
      const actual = b.actualYieldQty !== null && b.actualYieldQty !== undefined ? b.actualYieldQty : planned;
      const yieldEfficiency = Number(((actual / planned) * 100).toFixed(1));
      const processLossPercent = Number((((planned - actual) / planned) * 100).toFixed(1));

      totalPlanned += planned;
      totalActual += actual;

      return {
        _id: b._id,
        batchNo: b.batchNo,
        productName: b.productId ? b.productId.name : 'Unknown Product',
        plannedQty: planned,
        actualYieldQty: actual,
        varianceQty: actual - planned,
        yieldEfficiencyPercent: yieldEfficiency,
        processLossPercent: Math.max(0, processLossPercent),
        qcStatus: b.qcStatus || 'pending',
        unitProductionCost: b.unitProductionCost || 0
      };
    });

    const averageYieldEfficiency = totalPlanned > 0 ? Number(((totalActual / totalPlanned) * 100).toFixed(1)) : 100;

    res.json({
      averageYieldEfficiencyPercent: averageYieldEfficiency,
      totalBatchesAnalyzed: batches.length,
      batchMetrics
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FEATURE 10: Packing Material Reconciliation & Schedule T Audit ───

// POST /api/batch-productions/:id/label-reconciliation — Submit packaging reconciliation for independent verification.
router.post('/:id/label-reconciliation', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { items } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });
    if (batch.releasedBy || ['cancelled', 'rejected'].includes(batch.status)) {
      return res.status(409).json({ error: 'Released, cancelled or rejected batch packaging records cannot be changed' });
    }
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated packaging reconciliation operator identity is required' });
    }
    if (!batch.bomSnapshot || !Array.isArray(batch.bomSnapshot.ingredients)) {
      return res.status(409).json({ error: 'A pinned batch formula snapshot is required for packaging reconciliation' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Reconciliation items array is required' });
    }
    const packagingIds = new Set(batch.bomSnapshot.ingredients
      .filter(ingredient => ingredient.itemType === 'packaging')
      .map(ingredient => String(ingredient.rawMaterialId)));
    const submittedIds = new Set();
    const reconciledItems = [];
    for (const item of items) {
      const rawMaterialId = String(item.rawMaterialId || '');
      if (!rawMaterialId || !packagingIds.has(rawMaterialId)) {
        return res.status(400).json({ error: 'Only packaging materials present in the pinned batch formula can be reconciled', rawMaterialId });
      }
      if (submittedIds.has(rawMaterialId) || (batch.labelReconciliation || []).some(existing => String(existing.rawMaterialId) === rawMaterialId)) {
        return res.status(409).json({ error: 'Packaging material already has a reconciliation record; use a controlled correction workflow instead of overwriting it', rawMaterialId });
      }
      submittedIds.add(rawMaterialId);
      const issued = (batch.ingredientsConsumed || [])
        .filter(consumed => String(consumed.rawMaterialId) === rawMaterialId && Boolean(consumed.dispensingNo))
        .reduce((sum, consumed) => sum + Number(consumed.qtyConsumed || 0), 0);
      if (issued <= 0) {
        return res.status(409).json({ error: 'Packaging material must have independently verified dispensing before reconciliation', rawMaterialId });
      }
      const used = Number(item.qtyUsed);
      const damaged = Number(item.qtyDamaged || 0);
      const returned = Number(item.qtyReturnedToStore || 0);
      if (![used, damaged, returned].every(Number.isFinite) || used < 0 || damaged < 0 || returned < 0) {
        return res.status(400).json({ error: 'Used, damaged and returned quantities must be valid non-negative numbers', rawMaterialId });
      }
      if (used + damaged + returned > issued + 0.0001) {
        return res.status(400).json({ error: 'Accounted packaging quantity cannot exceed independently verified issued quantity', rawMaterialId, issued });
      }
      const material = await RawMaterial.findById(rawMaterialId).lean();
      if (!material) return res.status(404).json({ error: 'Packaging material not found', rawMaterialId });
      reconciledItems.push({
        rawMaterialId,
        name: material.name,
        qtyIssued: Number(issued.toFixed(4)),
        qtyUsed: Number(used.toFixed(4)),
        qtyDamaged: Number(damaged.toFixed(4)),
        qtyReturnedToStore: Number(returned.toFixed(4)),
        unaccountedQty: Number(Math.max(0, issued - used - damaged - returned).toFixed(4)),
        discrepancyPct: Number((Math.max(0, issued - used - damaged - returned) / issued * 100).toFixed(2)),
        discrepancyFlagged: issued - used - damaged - returned > 0.01,
        auditStatus: 'pending',
        reconciled: false,
        reconciledBy: req.user.id,
        reconciledByName: req.user.name,
        reconciledAt: new Date(),
        discrepancyNote: String(item.discrepancyNote || '').trim()
      });
    }
    batch.labelReconciliation = (batch.labelReconciliation || []).concat(reconciledItems);
    await batch.save();
    res.status(201).json({
      success: true,
      batchId: batch._id,
      overallAuditStatus: 'PENDING_INDEPENDENT_VERIFICATION',
      reconciledItems: batch.labelReconciliation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/label-reconciliation/:itemId/verify — Independent verification of packaging reconciliation.
router.patch('/:id/label-reconciliation/:itemId/verify', authorize('manufacturing:complete'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });
    if (batch.releasedBy) return res.status(409).json({ error: 'Released batch packaging reconciliation is immutable' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated independent verifier identity is required' });
    }
    const item = (batch.labelReconciliation || []).id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Packaging reconciliation item not found' });
    if (item.reconciled && item.auditStatus !== 'pending') {
      return res.status(409).json({ error: 'Packaging reconciliation has already been independently verified' });
    }
    if (String(item.reconciledBy) === String(req.user.id)) {
      return res.status(409).json({ error: 'The reconciliation operator cannot independently verify the same record' });
    }
    const issued = Number(item.qtyIssued || 0);
    const accounted = Number(item.qtyUsed || 0) + Number(item.qtyDamaged || 0) + Number(item.qtyReturnedToStore || 0);
    if (!Number.isFinite(issued) || issued <= 0 || accounted > issued + 0.0001) {
      return res.status(409).json({ error: 'Packaging reconciliation quantities are invalid and cannot be verified' });
    }
    const unaccounted = Math.max(0, issued - accounted);
    const flagged = unaccounted > 0.01;
    const discrepancyNote = String(req.body.discrepancyNote || item.discrepancyNote || '').trim();
    if (flagged && !discrepancyNote) {
      return res.status(400).json({ error: 'A discrepancy investigation note is required when packaging quantity remains unaccounted' });
    }
    item.unaccountedQty = Number(unaccounted.toFixed(4));
    item.discrepancyPct = Number((unaccounted / issued * 100).toFixed(2));
    item.discrepancyFlagged = flagged;
    item.auditStatus = flagged ? 'flagged' : 'passed';
    item.reconciled = true;
    item.verifiedBy = req.user.id;
    item.verifiedByName = req.user.name;
    item.verifiedAt = new Date();
    item.discrepancyNote = discrepancyNote;
    if (flagged) {
      batch.deviations.push({
        type: 'process_loss',
        description: 'Packaging material reconciliation discrepancy on batch ' + batch.batchNo + ' for material ' + item.name,
        detectedAt: new Date(),
        status: 'open'
      });
      if (req.io) req.io.emit('quality_alert', {
        type: 'label_reconciliation_discrepancy', batchId: batch._id, batchNo: batch.batchNo
      });
    }
    await batch.save();
    res.json({
      success: true,
      batchId: batch._id,
      auditStatus: item.auditStatus,
      reconciled: item.reconciled,
      verifiedBy: item.verifiedByName,
      verifiedAt: item.verifiedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/label-reconciliation-report — Internal packaging reconciliation record
router.get('/:id/label-reconciliation-report', authorize('manufacturing:view'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id).populate('productId', 'name sku').lean();
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};
    const items = batch.labelReconciliation || [];
    const hasFlagged = items.some(item => item.discrepancyFlagged || item.auditStatus === 'flagged');
    const allReconciled = items.length > 0 && items.every(item => item.reconciled && item.auditStatus === 'passed');
    res.json({
      documentType: 'INTERNAL_PACKAGING_MATERIAL_RECONCILIATION',
      title: 'Packaging Material Reconciliation Record',
      notice: 'System-generated internal record. It is not an official AYUSH, Schedule T, government, or regulatory audit certificate.',
      officialRegulatoryReport: false,
      firmDetails: {
        name: settings.firmName || null, address: settings.firmAddress || null,
        manufacturingLicenseNo: settings.manufacturingLicenseNo || null,
        gmpCertificateNo: settings.gmpCertificateNo || null
      },
      batchDetails: {
        batchNo: batch.batchNo || null, productName: batch.productId ? batch.productId.name : null,
        status: batch.status || null, manufacturingDate: batch.mfgDate || null, expiryDate: batch.expiryDate || null
      },
      auditSummary: {
        totalPackagingItems: items.length,
        auditResult: hasFlagged ? 'FLAGGED_REQUIRES_INVESTIGATION' : (allReconciled ? 'RECONCILED' : 'INCOMPLETE'),
        maxDiscrepancyPct: items.length > 0 ? Math.max(...items.map(item => item.discrepancyPct || 0)) : null
      },
      reconciliationItems: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FEATURE 12: Job-Work & Loan-License Manufacturing Module ───

// GET /api/batch-productions/job-work-summary — Ledger summary of outsourcing job work
router.get('/job-work-summary', authorize('manufacturing:view'), async (req, res) => {
  try {
    const jobBatches = await BatchProduction.find({ productionType: 'job_work' })
      .populate('jobWorkerId', 'name phone vendorType')
      .populate('productId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    let totalJobWorkCharges = 0;
    let totalDispatched = 0;
    let totalReceived = 0;

    const summaryList = jobBatches.map(b => {
      totalJobWorkCharges += (b.jobWorkCharges || 0);
      totalDispatched += (b.expectedYieldQty || b.plannedQty || 0);
      totalReceived += (b.receivedYieldQty || 0);

      return {
        _id: b._id,
        batchNo: b.batchNo,
        productName: b.productId ? b.productId.name : 'N/A',
        jobWorkerName: b.jobWorkerName || (b.jobWorkerId ? b.jobWorkerId.name : 'Third-Party Vendor'),
        jobWorkStatus: b.jobWorkStatus || 'pending',
        challanRef: b.jobWorkerChallanRef,
        dispatchedAt: b.dispatchedAt,
        expectedYieldQty: b.expectedYieldQty || b.plannedQty,
        receivedYieldQty: b.receivedYieldQty,
        conversionLossPct: b.conversionLossPct,
        jobWorkCharges: b.jobWorkCharges || 0
      };
    });

    res.json({
      totalJobWorkOrders: jobBatches.length,
      totalJobWorkCharges,
      averageConversionLossPct: totalDispatched > 0 ? Number((((totalDispatched - totalReceived) / totalDispatched) * 100).toFixed(2)) : 0,
      orders: summaryList
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions/:id/job-work/dispatch — Dispatch raw materials/bulk to job worker vendor
router.post('/:id/job-work/dispatch', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { jobWorkerId, jobWorkerName, expectedYieldQty, jobWorkCharges, notes } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });

    const challanNo = await generateAtomicDocumentNumber('jobWorkChallanNo', 'JW-CHALLAN-', 6);
    batch.productionType = 'job_work';
    batch.jobWorkStatus = 'dispatched_to_vendor';
    if (jobWorkerId) batch.jobWorkerId = jobWorkerId;
    batch.jobWorkerName = jobWorkerName || batch.jobWorkerName || 'Contract Manufacturer';
    batch.jobWorkerChallanRef = challanNo;
    batch.dispatchedAt = new Date();
    batch.expectedYieldQty = Number(expectedYieldQty || batch.plannedQty || 0);
    batch.jobWorkCharges = Number(jobWorkCharges || 0);
    if (req.user) batch.jobWorkDispatchedBy = req.user.id;

    await batch.save();

    res.json({
      success: true,
      message: `Job Work material dispatched to ${batch.jobWorkerName} under Delivery Challan ${challanNo}`,
      challanNo,
      batch
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions/:id/job-work/receive — Record received bulk/finished goods & conversion loss
router.post('/:id/job-work/receive', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { receivedYieldQty, jobWorkerCertificateRef, coaDocumentRef, status } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });

    const received = Number(receivedYieldQty || 0);
    const expected = batch.expectedYieldQty || batch.plannedQty || 1;
    const lossQty = Math.max(0, expected - received);
    const lossPct = Number(((lossQty / expected) * 100).toFixed(2));

    batch.receivedYieldQty = received;
    batch.actualYieldQty = received;
    batch.conversionLossPct = lossPct;
    batch.jobWorkStatus = status || (received >= expected ? 'received_fully' : 'received_partially');
    if (jobWorkerCertificateRef) batch.jobWorkerCertificateRef = jobWorkerCertificateRef;
    if (coaDocumentRef) batch.coaDocumentRef = coaDocumentRef;

    await batch.save();

    res.json({
      success: true,
      message: `Received ${received} units from Job Worker. Conversion Loss: ${lossPct}%`,
      batch
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Controlled two-person electronic signature for critical BMR stages ───
router.post('/:id/stages/:stageIndex/dual-esign', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const crypto = require('crypto');
    const AuditLog = require('../../models/AuditLog');
    const { role, comments } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });
    const idx = Number(req.params.stageIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= batch.stages.length) return res.status(400).json({ error: 'Invalid BMR stage index' });
    if (!req.user?.id) return res.status(401).json({ error: 'Authenticated user is required for electronic signature' });
    if (!['chemist','qa'].includes(role)) return res.status(400).json({ error: 'role must be chemist or qa' });
    const stage = batch.stages[idx];
    const now = new Date();
    const userId = req.user.id;
    const userName = req.user.name || req.user.email || 'Authenticated User';
    const payload = `${batch._id}:${batch.batchNo}:${stage.name}:${role}:${userId}:${now.toISOString()}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const signature = { userId, userName, signedAt: now, signatureHash: hash, comments: comments || '' };
    if (role === 'chemist') {
      if (stage.qaSignature?.userId && String(stage.qaSignature.userId) === String(userId)) return res.status(400).json({ error: 'The same user cannot perform both BMR signatures' });
      stage.chemistSignature = signature;
    } else {
      if (!stage.chemistSignature?.userId) return res.status(400).json({ error: 'Manufacturing Chemist signature is required before QA signature' });
      if (String(stage.chemistSignature.userId) === String(userId)) return res.status(400).json({ error: 'The same user cannot perform both BMR signatures' });
      stage.qaSignature = signature;
      stage.isDualSigned = true;
      stage.status = 'completed';
      stage.completedAt = now;
      stage.verifiedBy = userId;
      stage.verifiedByName = userName;
      stage.verifiedAt = now;
    }
    await batch.save();
    await AuditLog.create({ action: `BMR_STAGE_${role.toUpperCase()}_ESIGN`, module:'manufacturing', user:userId, userName, details:`${role} electronic signature recorded for Batch ${batch.batchNo}, Stage '${stage.name}'. Hash: ${hash}`, entityId:batch._id, entityType:'BatchProduction' }).catch(()=>{});
    res.json({success:true, stage, message: role === 'chemist' ? 'Manufacturing Chemist signature recorded. QA signature is still required.' : `QA signature recorded. Stage '${stage.name}' is now dual-signed.`});
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
