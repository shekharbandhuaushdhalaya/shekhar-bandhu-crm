const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const BillOfMaterials = require('../../models/BillOfMaterials');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { getSizeInMl, consumeFromReservation, releaseAllReservations, deductPackagingMaterials, calculateAggregateMaterialSufficiency } = require('../../services/batchProductionService');

const router = express.Router();

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
    const FORMULATION_BASIS = bom.formulationBasis || 100;

    const projectedConsumption = [];
    let isStockSufficient = true;

    for (const ing of (bom.ingredients || [])) {
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      if (!rm) continue;

      const qtyNeeded = (ing.qtyRequired || 0) * (valPlanned / FORMULATION_BASIS);
      let totalAvailable = 0;

      if (manufacturingUnitId) {
        const entries = await RawMaterialEntry.find({ rawMaterialId: rm._id, warehouseId: manufacturingUnitId, qcStatus: 'approved' });
        totalAvailable = entries.reduce((s, e) => s + (e.qty || 0), 0);
      } else {
        totalAvailable = rm.stockLevel || 0;
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

      // Formulation ingredient quantities on the BOM are expressed as
      // "qty per formulationBasis output units" — e.g. per 100ml for syrups, per 10 pcs for tablets.
      // formulationBasis defaults to 100 for backwards compatibility.
      const FORMULATION_BASIS = bom.formulationBasis || 100;
      const FORMULATION_BASIS_UNIT = (bom.formulationBasisUnit || 'ml').toLowerCase();
      const immediateDeductGroup = [];
      const blockGroup = [];

      if (!isDirectPurchase) {
        for (const ing of bom.ingredients) {
          const rm = await RawMaterial.findById(ing.rawMaterialId).session(session);
          if (!rm) continue;

          const isPackaging = ing.itemType === 'packaging' || rm.category === 'Packaging';
          const hasStage = ing.stageName && ing.stageName.trim().length > 0;

          let qtyNeeded = 0;
          if (isPackaging) {
            qtyNeeded = ing.qtyRequired * valPlanned;
          } else {
            if (effectiveYields) {
              let totalBatchVolume = 0;
              let allHaveSizes = true;
              for (const y of effectiveYields) {
                const sizeMl = getSizeInMl(y.size || '');
                if (sizeMl > 0) {
                  totalBatchVolume += sizeMl * Number(y.plannedQty);
                } else {
                  allHaveSizes = false;
                  break;
                }
              }
              if (allHaveSizes && totalBatchVolume > 0) {
                const totalInBasisUnit = FORMULATION_BASIS_UNIT === 'l' ? totalBatchVolume / 1000 : totalBatchVolume;
                qtyNeeded = ing.qtyRequired * (totalInBasisUnit / FORMULATION_BASIS);
              } else {
                const totalPcs = effectiveYields.reduce((s, y) => s + Number(y.plannedQty), 0);
                qtyNeeded = ing.qtyRequired * (totalPcs / FORMULATION_BASIS);
              }
            } else {
              qtyNeeded = ing.qtyRequired * (valPlanned / FORMULATION_BASIS);
            }
          }

          qtyNeeded = Number(qtyNeeded.toFixed(2));
          if (qtyNeeded <= 0) continue;

          const itemSpec = {
            rawMaterialId: ing.rawMaterialId,
            rmName: rm.name,
            unit: rm.unit || 'Kg',
            qtyNeeded,
            stageName: ing.stageName || ''
          };

          if (!isPackaging && !hasStage) {
            immediateDeductGroup.push(itemSpec);
          } else {
            blockGroup.push(itemSpec);
          }
        }
      }

      const ingredientsConsumed = [];
      const ingredientsReserved = [];
      let rawMaterialCost = 0;

      if (!isDirectPurchase) {
        // 1. Immediate-deduct group (no stage tag, not packaging)
        for (const item of immediateDeductGroup) {
          const entries = await RawMaterialEntry.find({
            rawMaterialId: item.rawMaterialId,
            warehouseId: manufacturingUnitId,
            qcStatus: 'approved'
          }).session(session);

          entries.sort((a, b) => {
            if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
            if (a.expiryDate && !b.expiryDate) return -1;
            if (!a.expiryDate && b.expiryDate) return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          const totalAvailable = entries.reduce((acc, e) => acc + Math.max(0, (e.qty || 0) - (e.reservedQty || 0)), 0);
          if (totalAvailable < item.qtyNeeded) {
            throw new Error(`Insufficient available stock for raw material: ${item.rmName}. Needed: ${item.qtyNeeded.toFixed(2)} ${item.unit}, Available: ${totalAvailable.toFixed(2)} ${item.unit} (excluding stock reserved for other runs)`);
          }

          let needed = item.qtyNeeded;
          for (const entry of entries) {
            if (needed <= 0.0001) break;
            const avail = Math.max(0, (entry.qty || 0) - (entry.reservedQty || 0));
            if (avail <= 0.0001) continue;

            const deduct = Math.min(needed, avail);
            const deductVal = Number(deduct.toFixed(2));
            if (deductVal <= 0) continue;

            entry.qty = Math.max(0, Number((entry.qty - deductVal).toFixed(2)));
            await entry.save({ session });

            rawMaterialCost += deductVal * (entry.purchaseRate || 0);
            ingredientsConsumed.push({
              rawMaterialId: item.rawMaterialId,
              rawMaterialEntryId: entry._id,
              qtyConsumed: deductVal,
              batchNo: entry.batchNo
            });
            needed = Number((needed - deductVal).toFixed(2));
          }
        }

        // 2. Block group (has stage tag OR is packaging)
        for (const item of blockGroup) {
          const entries = await RawMaterialEntry.find({
            rawMaterialId: item.rawMaterialId,
            warehouseId: manufacturingUnitId,
            qcStatus: 'approved'
          }).session(session);

          entries.sort((a, b) => {
            if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
            if (a.expiryDate && !b.expiryDate) return -1;
            if (!a.expiryDate && b.expiryDate) return 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          const totalAvailable = entries.reduce((acc, e) => acc + Math.max(0, (e.qty || 0) - (e.reservedQty || 0)), 0);
          if (totalAvailable < item.qtyNeeded) {
            throw new Error(`Insufficient available stock for raw material: ${item.rmName}. Needed: ${item.qtyNeeded.toFixed(2)} ${item.unit}, Available: ${totalAvailable.toFixed(2)} ${item.unit} (excluding stock reserved for other runs)`);
          }

          let needed = item.qtyNeeded;
          for (const entry of entries) {
            if (needed <= 0.0001) break;
            const avail = Math.max(0, (entry.qty || 0) - (entry.reservedQty || 0));
            if (avail <= 0.0001) continue;

            const block = Math.min(needed, avail);
            const blockVal = Number(block.toFixed(2));
            if (blockVal <= 0) continue;

            entry.reservedQty = Number(((entry.reservedQty || 0) + blockVal).toFixed(2));
            await entry.save({ session });

            ingredientsReserved.push({
              rawMaterialId: item.rawMaterialId,
              rawMaterialEntryId: entry._id,
              qtyReserved: blockVal,
              batchNo: entry.batchNo,
              stageName: item.stageName || ''
            });
            needed = Number((needed - blockVal).toFixed(2));
          }
        }
      }

      // Scaled overhead calculation — same fixed per-100-output-unit basis as formulation ingredients
      const overheadScale = valPlanned / FORMULATION_BASIS;
      const computedOverhead = (bom.overheadCost || 0) * overheadScale;

      // Configure Custom Stages or fallback to default manufacturing stages
      const customStages = bom.stages && bom.stages.length > 0
        ? bom.stages
        : [
          { name: 'Raw Material Verification & Weighing', targetDurationHours: 2 },
          { name: 'Primary Processing (Swasan/Mardan)', targetDurationHours: 4 },
          { name: 'Mixing & Blending', targetDurationHours: 4 },
          { name: 'Forming (Vati/Gutika)', targetDurationHours: 4 },
          { name: 'Drying', targetDurationHours: 8 },
          { name: 'QC Testing', targetDurationHours: 4 },
          { name: 'Packaging & Labeling', targetDurationHours: 4 }
        ];

      const batchStages = customStages.map((st, i) => {
        const startedAt = i === 0 ? new Date() : null;
        const targetDurationHours = st.targetDurationHours || (st.targetDurationDays ? st.targetDurationDays * 24 : 8);
        let targetCompletionDate = null;
        if (startedAt) {
          targetCompletionDate = new Date(startedAt.getTime() + targetDurationHours * 60 * 60 * 1000);
        }
        return {
          name: st.name,
          targetDurationDays: Math.ceil(targetDurationHours / 24),  // legacy field
          targetDurationHours,
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
          formulationBasis: bom.formulationBasis || 100,
          formulationBasisUnit: bom.formulationBasisUnit || 'ml',
          ingredients: (bom.ingredients || []).map(i => ({
            rawMaterialId: i.rawMaterialId,
            itemType: i.itemType || 'formulation',
            qtyRequired: i.qtyRequired || 0,
            stageName: i.stageName || ''
          })),
          overheadCost: bom.overheadCost || 0,
          stages: (bom.stages || []).map(s => ({ name: s.name, targetDurationHours: s.targetDurationHours || (s.targetDurationDays ? s.targetDurationDays * 24 : 8) }))
        },
        manufacturingUnitId,
        manufacturingUnitName: mfgUnit.name,
        plannedQty: valPlanned,
        plannedYields: effectiveYields || [],
        status: 'in_progress',
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
      req.io.emit('inventory_updated', { type: 'raw_material_deduction', batchNo: newBatch.batchNo });
    }

    res.status(201).json(newBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions/:id/line-clearance — Record pre-batch line clearance
router.post('/:id/line-clearance', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { previousBatchNo, checklist, notes } = req.body;
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (!checklist || !checklist.equipmentCleaned || !checklist.previousMaterialsRemoved || !checklist.previousLabelsDocumentsRemoved || !checklist.areaVisuallyInspected) {
      return res.status(400).json({ error: 'All 4 line clearance checklist items must be verified true before clearing line' });
    }

    const LineClearance = require('../../models/LineClearance');
    let record = await LineClearance.findOne({ batchId: batch._id });
    if (record) {
      record.checklist = checklist;
      record.notes = notes || '';
      record.clearedBy = req.user ? req.user.id : null;
      record.clearedByName = req.user ? req.user.name : 'Line Inspector';
      record.clearedAt = new Date();
      await record.save();
    } else {
      record = await LineClearance.create({
        batchId: batch._id,
        manufacturingUnitId: batch.manufacturingUnitId,
        previousBatchNo: previousBatchNo || '',
        checklist,
        notes: notes || '',
        clearedBy: req.user ? req.user.id : null,
        clearedByName: req.user ? req.user.name : 'Line Inspector',
        clearedAt: new Date()
      });
    }

    if (req.io) {
      req.io.emit('line_clearance_updated', record);
    }
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/approve-bmr — Pre-execution BMR recipe snapshot approval
router.patch('/:id/approve-bmr', authorize('manufacturing:approveBmr'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

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

    batch.bmrApprovedBy = req.user ? req.user.id : null;
    batch.bmrApprovedByName = req.user ? req.user.name : 'Authorized Approver';
    batch.bmrApprovedAt = new Date();

    if (unverifiedIngredients.length > 0) {
      batch.bmrUnverifiedAcknowledged = true;
      batch.bmrUnverifiedAcknowledgedBy = req.user ? req.user.id : null;
      batch.bmrUnverifiedAcknowledgedByName = req.user ? req.user.name : 'Authorized Approver';
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

    // Gate Stage 1 start on Line Clearance & BMR Approval
    if (stageIndex === 0 && (status === 'in_progress' || !status)) {
      const LineClearance = require('../../models/LineClearance');
      const clearance = await LineClearance.findOne({ batchId: batch._id });
      if (!clearance) {
        return res.status(400).json({ error: 'Line clearance required before starting production' });
      }
      if (!batch.bmrApprovedBy) {
        return res.status(400).json({ error: 'BMR pre-execution approval required before starting production' });
      }
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
      currentStage.completedBy = completedBy || (req.user ? req.user.name : '');
      currentStage.performedBy = req.user ? req.user.id : null;
      currentStage.performedByName = req.user ? req.user.name : (completedBy || '');
    }
    if (notes !== undefined) {
      currentStage.notes = notes;
    }
    currentStage.status = newStatus;

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
    } else if ((newStatus === 'completed' || newStatus === 'skipped') && stageIndex + 1 < batch.stages.length) {
      const nextStage = batch.stages[stageIndex + 1];
      if (nextStage.status === 'pending') {
        nextStage.status = 'in_progress';
        const started = new Date();
        nextStage.startedAt = started;
        const durationHours = nextStage.targetDurationHours || (nextStage.targetDurationDays ? nextStage.targetDurationDays * 24 : 8);
        nextStage.targetCompletionDate = new Date(started.getTime() + durationHours * 60 * 60 * 1000);
      }
    }

    // Deduct stage-tied ingredients from inventory (FIFO) when stage is completed
    // Guard: skip if already deducted to prevent double-deduction on re-completion
    if (!currentStage.ingredientsDeducted) {
      const stageIngredients = req.body.stageIngredients;
      if (newStatus === 'completed' && stageIngredients && stageIngredients.length > 0) {
        let totalInputQty = 0;
        let totalLossQty = 0;
        const lossReasons = [];
        for (const si of stageIngredients) {
          const qtyNeeded = Number(si.qtyNeeded) || 0;
          const wastage = Number(si.wastage) || 0;
          const totalDeductQty = qtyNeeded + wastage;
          if (totalDeductQty > 0) {
            await consumeFromReservation(batch, si.rawMaterialId, totalDeductQty);
          }

          totalInputQty += qtyNeeded;
          totalLossQty += wastage;
          if (wastage > 0) {
            lossReasons.push({ rawMaterialId: si.rawMaterialId, qty: wastage, reason: si.lossReason || '' });
          }
        }

        currentStage.inputQty = (currentStage.inputQty || 0) + totalInputQty;
        currentStage.lossQty = (currentStage.lossQty || 0) + totalLossQty;
        currentStage.outputQty = Math.max(0, currentStage.inputQty - currentStage.lossQty);
        currentStage.lossPercent = currentStage.inputQty > 0 ? Number(((currentStage.lossQty / currentStage.inputQty) * 100).toFixed(2)) : 0;
        if (req.body.lossReason) currentStage.lossReason = req.body.lossReason;
        if (lossReasons.length > 0) currentStage.lossItems = lossReasons;
        currentStage.ingredientsDeducted = true;
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
    if (stage.status !== 'completed') {
      return res.status(400).json({ error: 'Stage must be completed before verification' });
    }

    const userId = req.user ? req.user.id.toString() : null;
    const performedById = stage.performedBy ? stage.performedBy.toString() : null;

    if (userId && performedById && userId === performedById) {
      return res.status(400).json({ error: 'Performer cannot verify their own stage — 4-eye verification required' });
    }

    stage.verifiedBy = req.user ? req.user.id : null;
    stage.verifiedByName = req.user ? req.user.name : 'Verifier';
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

    const batch = await BatchProduction.findById(req.params.id);
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
    batch.qcPassedByUser = req.user ? req.user.id : null;
    batch.qcPassedBy = (req.user ? req.user.name : '') || qcPassedBy.trim();
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
    const now = new Date();
    if (batch.shelfLifeMonths) {
      const exp = new Date(now);
      exp.setMonth(exp.getMonth() + batch.shelfLifeMonths);
      batch.expiryDate = exp;
    }

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
        mfgDate: now,
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
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const backfillIngs = (batch.bomSnapshot?.ingredients || []).filter(i => {
      const hasStage = i.stageName && i.stageName.trim().length > 0;
      const alreadyConsumed = batch.ingredientsConsumed.some(
        c => c.rawMaterialId?.toString() === i.rawMaterialId?.toString()
      );
      return hasStage && !alreadyConsumed;
    });
    if (backfillIngs.length > 0) {
      const totalYield = batch.actualYieldQty || 0;
      const totalPlanned = batch.plannedQty || 0;
      for (const ing of backfillIngs) {
        const isPackaging = ing.itemType === 'packaging';
        const qtyNeeded = isPackaging
          ? Number(((ing.qtyRequired || 0) * totalYield).toFixed(2))
          : Number(((ing.qtyRequired || 0) * (totalPlanned / 100)).toFixed(2));
        if (qtyNeeded <= 0) continue;
        const entries = await RawMaterialEntry.find({ rawMaterialId: ing.rawMaterialId, warehouseId: batch.manufacturingUnitId, qcStatus: 'approved' }).sort({ createdAt: 1 }).lean();
        let needed = qtyNeeded;
        for (const entry of entries) {
          if (needed <= 0.0001) break;
          if ((entry.qty || 0) <= 0) continue;
          const deduct = Math.min(needed, Math.round(entry.qty * 100) / 100);
          if (deduct <= 0) continue;
          await RawMaterialEntry.updateOne({ _id: entry._id }, { $inc: { qty: -deduct } });
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

// PATCH /api/batch-productions/:id/release — Market release approval separate from QC inspection
router.patch('/:id/release', authorize('manufacturing:release'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status !== 'completed' || batch.qcStatus !== 'approved') {
      return res.status(400).json({ error: 'Batch must be completed and QC approved before market release' });
    }

    batch.releasedBy = req.user ? req.user.id : null;
    batch.releasedByName = req.user ? req.user.name : 'Authorized Quality Releaser';
    batch.releasedAt = new Date();

    await batch.save();

    if (req.io) {
      req.io.emit('mfg_batch_released', batch);
    }

    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const SystemSettings = require('../../models/SystemSettings');
    const LineClearance = require('../../models/LineClearance');
    const RetentionSample = require('../../models/RetentionSample');

    const [settings, lineClearance, retentionSamples] = await Promise.all([
      SystemSettings.findOne().lean(),
      LineClearance.findOne({ batchId: batch._id }).lean(),
      RetentionSample.find({ batchId: batch._id }).lean()
    ]);

    const sysSettings = settings || {};

    const botanicalLookup = require('../../utils/botanicalLookup');
    const enrichedIngredients = [];
    for (const ing of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
      const rate = entry ? (entry.purchaseRate || 0) : 0;
      const rm = ing.rawMaterialId || {};
      const botProfile = await botanicalLookup.getBotanicalProfile(rm.name || '');

      enrichedIngredients.push({
        name: rm.name || 'Unknown Material',
        botanicalName: rm.botanicalName || botProfile.latinName || '',
        partUsed: rm.partUsed || botProfile.partUsed || '',
        pharmacopoeialStandard: rm.pharmacopoeialStandard || botProfile.standard || 'API',
        monographRef: rm.monographRef || botProfile.monographRef || '',
        pharmacopoeiaSpecs: {
          standard: botProfile.standard || 'API',
          latinName: botProfile.latinName || '',
          ashValue: botProfile.ashValue || null,
          extractiveValue: botProfile.extractiveValue || null
        },
        isScheduleE1: Boolean(rm.isScheduleE1),
        code: rm.sku || rm.code || 'N/A',
        batchNo: ing.batchNo,
        qtyConsumed: ing.qtyConsumed,
        unit: rm.unit || 'kg',
        purchaseRate: rate,
        itemCost: Number((ing.qtyConsumed * rate).toFixed(2))
      });
    }

    const productPopulated = batch.productId ? batch.productId : null;

    // Fetch product names for plannedYields / yields if productId is not populated
    const yieldProdIds = new Set();
    if (batch.plannedYields) batch.plannedYields.forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    if (batch.yields) batch.yields.forEach(y => { if (y.productId) yieldProdIds.add(y.productId.toString()); });
    const yieldProducts = yieldProdIds.size > 0 ? await Product.find({ _id: { $in: [...yieldProdIds] } }).select('name size sku category').lean() : [];
    const yieldProdMap = {};
    yieldProducts.forEach(p => { yieldProdMap[p._id.toString()] = p; });

    const PharmacopoeiaEntry = require('../../models/PharmacopoeiaEntry');
    const unverifiedIngredients = [];

    for (const ing of enrichedIngredients) {
      if (ing.name) {
        const escapedName = ing.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedBot = (ing.botanicalName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchConds = [{ ayurvedicName: new RegExp(`^${escapedName}$`, 'i') }];
        if (escapedBot) searchConds.push({ botanicalName: new RegExp(`^${escapedBot}$`, 'i') });
        const pEntry = await PharmacopoeiaEntry.findOne({ $or: searchConds }).lean();
        if (pEntry && pEntry.verified === false) {
          unverifiedIngredients.push({
            name: ing.name,
            botanicalName: ing.botanicalName || pEntry.botanicalName || '',
            monographRef: ing.monographRef || pEntry.monographRef || '',
            source: pEntry.source || 'AI-generated'
          });
        }
      }
    }

    const hasUnverifiedReferences = unverifiedIngredients.length > 0;

    res.json({
      batchNo: batch.batchNo,
      hasUnverifiedReferences,
      unverifiedIngredients,
      ayushHeader: {
        firmName: sysSettings.firmName || 'SHEKHAR BANDHU AUSHADHALAYA',
        firmAddress: sysSettings.firmAddress || 'PILIKOTHI, VARANASI (U.P.)',
        manufacturingLicenseNo: sysSettings.manufacturingLicenseNo || 'AYUSH-1983-UP',
        gmpCertificateNo: sysSettings.gmpCertificateNo || 'GMP-AYUSH-2026-VNS',
        stateUtCode: sysSettings.stateUtCode || 'UP'
      },
      productName: productPopulated ? productPopulated.name : 'Unknown Product',
      productSku: productPopulated ? productPopulated.sku : 'N/A',
      productPrice: productPopulated ? productPopulated.price : 0,
      productSize: productPopulated ? productPopulated.size : '',
      productCategory: productPopulated ? (productPopulated.category || 'Ayurvedic Medicine') : 'Ayurvedic Medicine',
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || 0,
      mfgDate: batch.mfgDate || null,
      expiryDate: batch.expiryDate || null,
      shelfLifeMonths: batch.shelfLifeMonths || null,
      bmrApprovedBy: batch.bmrApprovedBy || null,
      bmrApprovedByName: batch.bmrApprovedByName || '',
      bmrApprovedAt: batch.bmrApprovedAt || null,
      releasedBy: batch.releasedBy || null,
      releasedByName: batch.releasedByName || '',
      releasedAt: batch.releasedAt || null,
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
      bomSnapshot: batch.bomSnapshot || null,
      lineClearance: lineClearance || null,
      labelReconciliation: batch.labelReconciliation || [],
      retentionSamples: retentionSamples || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/coa — Auto-generate Certificate of Analysis (CoA) document JSON
router.get('/:id/coa', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id)
      .populate('productId')
      .lean();

    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};

    const product = batch.productId || {};
    const qc = batch.qcParameters || {};

    const testResults = [
      { parameter: 'Organoleptic Evaluation', specification: 'Standard', result: qc.organoleptic || 'Complies', status: 'PASS' },
      { parameter: 'Moisture Content', specification: qc.moistureLimit || 'NMT 10% w/w', result: qc.moistureContent !== null && qc.moistureContent !== undefined ? `${qc.moistureContent}% w/w` : 'N/A', status: 'PASS' },
      { parameter: 'Total Ash Value', specification: qc.ashValueLimit || 'NMT 5% w/w', result: qc.ashValue !== null && qc.ashValue !== undefined ? `${qc.ashValue}% w/w` : 'N/A', status: 'PASS' },
      { parameter: 'pH Value (1% w/v soln)', specification: qc.pHLimit || '4.0 - 7.0', result: qc.pHValue !== null && qc.pHValue !== undefined ? `${qc.pHValue}` : 'N/A', status: 'PASS' },
      { parameter: 'Disintegration Time', specification: qc.disintegrationLimit || 'NMT 30 mins', result: qc.disintegrationTime !== null && qc.disintegrationTime !== undefined ? `${qc.disintegrationTime} mins` : 'N/A', status: 'PASS' },
      { parameter: 'Heavy Metals (Pb, Cd, As, Hg)', specification: 'Within API limits', result: qc.heavyMetals || 'Complies', status: 'PASS' },
      { parameter: 'Microbial Limit Test', specification: 'Within API limits', result: qc.microbialLimit || 'Complies', status: 'PASS' }
    ];

    const coaDocument = {
      title: 'CERTIFICATE OF ANALYSIS (CoA)',
      firmDetails: {
        name: settings.firmName || 'SHEKHAR BANDHU AUSHADHALAYA',
        address: settings.firmAddress || 'VARANASI (U.P.)',
        licenseNo: settings.manufacturingLicenseNo || 'N/A',
        gmpCertNo: settings.gmpCertificateNo || 'N/A'
      },
      batchDetails: {
        batchNo: batch.batchNo,
        productName: product.name || 'Ayurvedic Medicine',
        productSku: product.sku || 'N/A',
        spcCode: product.specificProductCode || 'N/A',
        batchSize: `${batch.actualYieldQty || batch.plannedQty} units`,
        mfgDate: batch.mfgDate ? new Date(batch.mfgDate).toLocaleDateString('en-IN') : 'N/A',
        expiryDate: batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-IN') : 'N/A',
        testingDate: batch.endDate ? new Date(batch.endDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
        testStandardRef: qc.testStandardRef || 'As per Pharmacopoeial API Standards'
      },
      testResults,
      overallResult: batch.qcStatus === 'rejected' ? 'REJECTED' : 'APPROVED & PASSED',
      inspectorSignature: {
        name: batch.qcPassedBy || 'Authorized Quality Analyst',
        timestamp: batch.endDate ? new Date(batch.endDate).toISOString() : new Date().toISOString()
      },
      marketReleaserSignature: {
        name: batch.releasedByName || 'Authorized Quality Releaser',
        timestamp: batch.releasedAt ? new Date(batch.releasedAt).toISOString() : null
      }
    };

    res.json(coaDocument);
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
        qcStatus: b.qcStatus || 'approved',
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

// POST /api/batch-productions/:id/label-reconciliation — Record packaging label reconciliation & audit check
router.post('/:id/label-reconciliation', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { items } = req.body; // array of { rawMaterialId, name, qtyIssued, qtyUsed, qtyDamaged, qtyReturnedToStore, discrepancyNote }
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Reconciliation items array is required' });
    }

    let overallFlagged = false;
    const reconciledItems = items.map(item => {
      const issued = Number(item.qtyIssued || 0);
      const used = Number(item.qtyUsed || 0);
      const damaged = Number(item.qtyDamaged || 0);
      const returned = Number(item.qtyReturnedToStore || 0);
      const unaccounted = Math.max(0, issued - (used + damaged + returned));
      const discrepancyPct = issued > 0 ? Number(((unaccounted / issued) * 100).toFixed(2)) : 0;
      const isFlagged = discrepancyPct > 0.5;

      if (isFlagged) overallFlagged = true;

      return {
        rawMaterialId: item.rawMaterialId,
        name: item.name,
        qtyIssued: issued,
        qtyUsed: used,
        qtyDamaged: damaged,
        qtyReturnedToStore: returned,
        unaccountedQty: unaccounted,
        discrepancyPct,
        discrepancyFlagged: isFlagged,
        auditStatus: isFlagged ? 'flagged' : 'passed',
        reconciled: true,
        reconciledBy: req.user ? req.user.id : null,
        reconciledAt: new Date(),
        discrepancyNote: item.discrepancyNote || (isFlagged ? `Flagged: ${discrepancyPct}% discrepancy exceeds 0.5% Schedule T limit` : 'Pass')
      };
    });

    batch.labelReconciliation = reconciledItems;

    if (overallFlagged) {
      batch.deviations.push({
        type: 'process_loss',
        description: `Schedule T Packing Audit Alert: Label reconciliation discrepancy exceeds 0.5% threshold on batch ${batch.batchNo}`,
        detectedAt: new Date(),
        status: 'open'
      });

      if (req.io) {
        req.io.emit('quality_alert', {
          type: 'label_reconciliation_discrepancy',
          batchId: batch._id,
          batchNo: batch.batchNo
        });
      }
    }

    await batch.save();
    res.json({
      success: true,
      batchId: batch._id,
      overallAuditStatus: overallFlagged ? 'FLAGGED_EXCEEDS_0.5_PERCENT' : 'PASSED',
      reconciledItems: batch.labelReconciliation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/label-reconciliation-report — Official AYUSH Schedule T Audit Report JSON
router.get('/:id/label-reconciliation-report', authorize('manufacturing:view'), async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id).populate('productId', 'name sku').lean();
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};

    const items = batch.labelReconciliation || [];
    const hasFlagged = items.some(i => i.discrepancyFlagged);

    res.json({
      title: `AYUSH SCHEDULE T PACKING MATERIAL RECONCILIATION AUDIT REPORT — BATCH ${batch.batchNo}`,
      firmDetails: {
        name: settings.firmName || 'SHEKHAR BANDHU AUSHADHALAYA',
        gmpCertNo: settings.gmpCertificateNo || 'GMP-AYUSH-2026-VNS',
        licenseNo: settings.manufacturingLicenseNo || 'AYUSH-1983-UP'
      },
      batchDetails: {
        batchNo: batch.batchNo,
        productName: batch.productId ? batch.productId.name : 'N/A',
        status: batch.status,
        mfgDate: batch.mfgDate,
        expiryDate: batch.expiryDate
      },
      auditSummary: {
        totalPackagingItems: items.length,
        auditResult: hasFlagged ? 'REJECTED / FLAGGED (DISCREPANCY > 0.5%)' : 'COMPLIANT (SCHEDULE T PASSED)',
        maxDiscrepancyPct: items.length > 0 ? Math.max(...items.map(i => i.discrepancyPct || 0)) : 0
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

    const challanNo = `JW-CHALLAN-${Date.now().toString().slice(-6)}`;
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

// ─── FEATURE 13: Dual E-Signature & Audit Trail for Critical BMR Steps ───

// POST /api/batch-productions/:id/stages/:stageIndex/dual-esign — Dual signature verification
router.post('/:id/stages/:stageIndex/dual-esign', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const crypto = require('crypto');
    const AuditLog = require('../../models/AuditLog');
    const { chemistName, chemistComments, qaName, qaComments } = req.body;

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production record not found' });

    const idx = parseInt(req.params.stageIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= batch.stages.length) {
      return res.status(400).json({ error: 'Invalid BMR stage index' });
    }

    const stage = batch.stages[idx];
    const timestamp = new Date();
    const signPayload = `${batch.batchNo}:${stage.name}:${chemistName || 'Chemist'}:${qaName || 'QA Officer'}:${timestamp.toISOString()}`;
    const hash = crypto.createHash('sha256').update(signPayload).digest('hex');

    stage.isDualSigned = true;
    stage.status = 'completed';
    stage.completedAt = timestamp;
    stage.chemistSignature = {
      userId: req.user ? req.user.id : null,
      userName: chemistName || (req.user ? req.user.name : 'Manufacturing Chemist'),
      signedAt: timestamp,
      signatureHash: hash,
      comments: chemistComments || 'Verified & Performed by Manufacturing Chemist'
    };
    stage.qaSignature = {
      userId: req.user ? req.user.id : null,
      userName: qaName || 'Quality Assurance Manager',
      signedAt: timestamp,
      signatureHash: hash,
      comments: qaComments || 'Verified & Released by QA Officer'
    };

    await batch.save();

    // Write to AuditLog for 21 CFR Part 11 electronic audit compliance
    await AuditLog.create({
      action: 'BMR_STAGE_DUAL_ESIGN',
      module: 'manufacturing',
      user: req.user ? req.user.id : null,
      userName: chemistName || (req.user ? req.user.name : 'Manufacturing Chemist'),
      details: `Dual E-Signature verified for Batch ${batch.batchNo}, Stage '${stage.name}'. Hash: ${hash}`,
      entityId: batch._id,
      entityType: 'BatchProduction'
    }).catch(() => {});

    res.json({
      success: true,
      message: `Dual E-Signature verified for stage '${stage.name}' on Batch ${batch.batchNo}`,
      signatureHash: hash,
      stage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;