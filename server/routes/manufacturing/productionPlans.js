const express = require('express');
const ProductionPlan = require('../../models/ProductionPlan');
const BillOfMaterials = require('../../models/BillOfMaterials');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const { resolveManufacturingWarehouse } = require('../../services/manufacturingWarehouseService');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const RawMaterial = require('../../models/RawMaterial');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/production-plans — List production plans
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { manufacturingUnitId, status } = req.query;
    const filter = {};
    if (manufacturingUnitId) filter.manufacturingUnitId = manufacturingUnitId;
    if (status) filter.status = status;
    const plans = await ProductionPlan.find(filter).sort({ startDate: 1 }).lean();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/production-plans — Create new production plan & run aggregate raw material sufficiency check
router.post('/', authorize('manufacturing:create'), async (req, res) => {
  try {
    const { title, manufacturingUnitId, manufacturingUnitName, startDate, endDate, plannedBatches, notes } = req.body;
    if (!title || !manufacturingUnitId || !manufacturingUnitName || !plannedBatches || !Array.isArray(plannedBatches) || plannedBatches.length === 0) {
      return res.status(400).json({ error: 'title, manufacturingUnitId, manufacturingUnitName, and plannedBatches array are required' });
    }

    const parsedStartDate = new Date(startDate || Date.now());
    const parsedEndDate = new Date(endDate || Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
    }
    if (parsedEndDate < parsedStartDate) {
      return res.status(400).json({ error: 'endDate cannot be earlier than startDate' });
    }
    for (const [index, batch] of plannedBatches.entries()) {
      const quantity = Number(batch.plannedQty);
      if (!batch.productId || !Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({ error: `plannedBatches[${index}] must include a productId and plannedQty of at least 1` });
      }
    }

    const fy = `${new Date().getFullYear() % 100}-${(new Date().getFullYear() + 1) % 100}`;
    const planNo = await generateAtomicDocumentNumber(`productionPlan_${fy}`, `PLN/${fy}/`, 5);
    const manufacturingWarehouse = await resolveManufacturingWarehouse(manufacturingUnitId);

    // Aggregate total raw material requirements across all planned batches
    const rawMaterialNeeds = new Map(); // rawMaterialId -> totalNeeded
    const pinnedBatches = [];

    for (const pb of plannedBatches) {
      const bom = await BillOfMaterials.findOne({ productId: pb.productId, isActive: true })
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean();
      if (!bom) {
        return res.status(400).json({ error: `No active recipe found for planned product ${pb.productName || pb.productId}` });
      }
      if (!Array.isArray(bom.ingredients) || bom.ingredients.length === 0) {
        return res.status(400).json({ error: `Active recipe for ${pb.productName || pb.productId} has no ingredients` });
      }
      const basis = Number(bom.formulationBasis) || 100;
      if (!Number.isFinite(basis) || basis <= 0) return res.status(400).json({ error: 'Active recipe has an invalid formulation basis' });
      const multiplier = Number(pb.plannedQty) / basis;
      pinnedBatches.push({ ...pb, bomId: bom._id, bomSnapshot: { recipeName: bom.recipeName, recipeUpdatedAt: bom.updatedAt, formulationBasis: basis, formulationBasisUnit: bom.formulationBasisUnit || '', formulationStandardRef: bom.formulationStandardRef || '', ingredients: bom.ingredients.map(ing => ({ rawMaterialId: ing.rawMaterialId, qtyRequired: Number(ing.qtyRequired), itemType: ing.itemType || 'formulation', stageName: ing.stageName || '', isPrintedMaterial: Boolean(ing.isPrintedMaterial) })), stages: (bom.stages || []).map(stage => ({ name: stage.name, targetDurationHours: stage.targetDurationHours || 8 })), overheadCost: Number(bom.overheadCost || 0) } });
      for (const ing of bom.ingredients) {
        const rmId = ing.rawMaterialId ? ing.rawMaterialId.toString() : null;
        if (!rmId) continue;
        const requiredPerYield = Number(ing.qtyRequired);
        if (!Number.isFinite(requiredPerYield) || requiredPerYield < 0) {
          return res.status(400).json({ error: `Active recipe for ${pb.productName || pb.productId} has an invalid ingredient quantity` });
        }
        const needed = requiredPerYield * multiplier;
        rawMaterialNeeds.set(rmId, (rawMaterialNeeds.get(rmId) || 0) + needed);
      }
    }

    // Check available stock in target warehouse/unit for approved raw materials
    let shortageDetected = false;
    const shortageDetails = [];

    for (const [rmId, requiredQty] of rawMaterialNeeds.entries()) {
      const rm = await RawMaterial.findById(rmId).lean();
      const rmName = rm ? rm.name : 'Raw Material';

      const entries = await RawMaterialEntry.find({
        warehouseId: manufacturingWarehouse._id,
        rawMaterialId: rmId,
        qcStatus: 'approved',
        $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }]
      }).lean();

      const availableQty = entries.reduce((acc, e) => acc + Math.max(0, Number(e.qty || 0) - Number(e.reservedQty || 0)), 0);
      if (availableQty < requiredQty) {
        shortageDetected = true;
        shortageDetails.push({
          rawMaterialName: rmName,
          requiredQty: Number(requiredQty.toFixed(2)),
          availableQty: Number(availableQty.toFixed(2)),
          shortageQty: Number((requiredQty - availableQty).toFixed(2))
        });
      }
    }

    const plan = await ProductionPlan.create({
      planNo,
      title,
      manufacturingUnitId,
      manufacturingUnitName,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      plannedBatches: pinnedBatches,
      rawMaterialSufficiencyStatus: shortageDetected ? 'shortage_detected' : 'sufficient',
      shortageDetails,
      status: 'draft',
      plannerName: req.user ? req.user.name : 'System',
      createdByUserId: req.user?.id || null,
      notes: notes || ''
    });

    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/production-plans/:id/status — Update plan status with atomic material reservation
router.patch('/:id/status', authorize('manufacturing:edit'), async (req, res) => {
  const { withTransaction } = require('../../utils/withTransaction');
  try {
    const { status } = req.body;
    const allowedStatuses = ['draft', 'approved', 'in_production', 'completed', 'cancelled'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid production plan status' });
    const transitions = { draft: ['approved', 'cancelled'], approved: ['in_production', 'cancelled'], in_production: ['completed', 'cancelled'], completed: [], cancelled: [] };
    const updated = await withTransaction(async session => {
      const plan = await ProductionPlan.findById(req.params.id).session(session);
      if (!plan) { const e = new Error('Production plan not found'); e.code = 'PLAN_NOT_FOUND'; throw e; }
      if (!(transitions[plan.status] || []).includes(status)) { const e = new Error('Invalid production plan transition: ' + plan.status + ' -> ' + status); e.code = 'INVALID_PLAN_TRANSITION'; throw e; }

      if (status === 'approved') {
        const approverId = req.user?.id;
        if (!approverId) { const e = new Error('Authenticated approver identity is required'); e.code = 'APPROVER_REQUIRED'; throw e; }
        if (plan.createdByUserId && String(plan.createdByUserId) === String(approverId)) { const e = new Error('The plan creator cannot approve their own production plan'); e.code = 'PLAN_MAKER_CHECKER_REQUIRED'; throw e; }
        const warehouse = await resolveManufacturingWarehouse(plan.manufacturingUnitId);
        if (!warehouse?._id) { const e = new Error('Manufacturing warehouse could not be resolved'); e.code = 'PLAN_WAREHOUSE_UNAVAILABLE'; throw e; }

        const needs = new Map();
        for (const batch of plan.plannedBatches || []) {
          const snapshot = batch.bomSnapshot;
          if (!batch.bomId || !snapshot || !Array.isArray(snapshot.ingredients) || !snapshot.ingredients.length) { const error = new Error('This production plan has no pinned formula snapshot. Recreate the draft before approval.'); error.code = 'PLAN_RECIPE_SNAPSHOT_REQUIRED'; throw error; }
          const basis = Number(snapshot.formulationBasis);
          if (!Number.isFinite(basis) || basis <= 0) { const error = new Error('Pinned recipe formulation basis is invalid'); error.code = 'PLAN_RECIPE_INVALID'; throw error; }
          for (const ingredient of snapshot.ingredients) {
            if (!ingredient.rawMaterialId) continue;
            const perBasis = Number(ingredient.qtyRequired);
            if (!Number.isFinite(perBasis) || perBasis < 0) { const e = new Error('Recipe contains an invalid ingredient quantity'); e.code = 'PLAN_RECIPE_INVALID'; throw e; }
            const id = String(ingredient.rawMaterialId);
            needs.set(id, (needs.get(id) || 0) + perBasis * Number(batch.plannedQty) / basis);
          }
        }

        const reservations = [];
        const shortages = [];
        for (const [rawMaterialId, requiredQty] of needs) {
          const material = await RawMaterial.findById(rawMaterialId).select('name').session(session).lean();
          let remaining = requiredQty;
          const entries = await RawMaterialEntry.find({
            warehouseId: warehouse._id, rawMaterialId, qcStatus: 'approved',
            $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }]
          }).sort({ expiryDate: 1, createdAt: 1, _id: 1 }).session(session).lean();
          for (const entry of entries) {
            if (remaining <= 1e-9) break;
            const available = Math.max(0, Number(entry.qty || 0) - Number(entry.reservedQty || 0));
            const take = Math.min(remaining, available);
            if (take <= 1e-9) continue;
            const result = await RawMaterialEntry.updateOne({
              _id: entry._id, qcStatus: 'approved', warehouseId: warehouse._id,
              $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
              $expr: { $gte: [{ $subtract: ['$qty', { $ifNull: ['$reservedQty', 0] }] }, take] }
            }, { $inc: { reservedQty: take } }, { session });
            if (result.modifiedCount !== 1) continue;
            reservations.push({ rawMaterialId, rawMaterialEntryId: entry._id, batchNo: entry.batchNo, qty: take });
            remaining -= take;
          }
          if (remaining > 1e-6) shortages.push({
            rawMaterialName: material?.name || 'Raw Material',
            requiredQty: Number(requiredQty.toFixed(3)),
            availableQty: Number((requiredQty - remaining).toFixed(3)),
            shortageQty: Number(remaining.toFixed(3))
          });
        }
        if (shortages.length) {
          const e = new Error('Live raw-material availability is insufficient; no stock was reserved and the plan remains unapproved');
          e.code = 'PLAN_MATERIALS_NOT_SUFFICIENT';
          e.shortageDetails = shortages;
          throw e;
        }
        plan.materialReservations = reservations;
        plan.rawMaterialSufficiencyStatus = 'sufficient';
        plan.shortageDetails = [];
        plan.approvedByUserId = approverId;
        plan.approvedByName = req.user?.name || req.user?.email || 'Approver';
        plan.approvedAt = new Date();
      }

      if (status === 'cancelled' && Array.isArray(plan.materialReservations) && plan.materialReservations.length) {
        for (const reservation of plan.materialReservations) {
          const result = await RawMaterialEntry.updateOne({
            _id: reservation.rawMaterialEntryId, reservedQty: { $gte: reservation.qty }
          }, { $inc: { reservedQty: -reservation.qty } }, { session });
          if (result.modifiedCount !== 1) {
            const e = new Error('Could not safely release a production reservation; investigate stock ledger before retrying');
            e.code = 'RESERVATION_RELEASE_CONFLICT';
            throw e;
          }
        }
        plan.materialReservations = [];
      }
      plan.status = status;
      await plan.save({ session });
      return plan;
    });
    res.json(updated);
  } catch (err) {
    if (err.code === 'PLAN_MATERIALS_NOT_SUFFICIENT') {
      const plan = await ProductionPlan.findById(req.params.id);
      if (plan && plan.status === 'draft') {
        plan.rawMaterialSufficiencyStatus = 'shortage_detected';
        plan.shortageDetails = err.shortageDetails || [];
        await plan.save();
      }
      return res.status(409).json({ error: err.message, code: err.code, shortageDetails: err.shortageDetails || [] });
    }
    const statusCode = err.code === 'PLAN_NOT_FOUND' ? 404
      : ['INVALID_PLAN_TRANSITION', 'PLAN_MAKER_CHECKER_REQUIRED', 'PLAN_WAREHOUSE_UNAVAILABLE', 'PLAN_RECIPE_UNAVAILABLE', 'PLAN_RECIPE_SNAPSHOT_REQUIRED', 'PLAN_RECIPE_INVALID', 'RESERVATION_RELEASE_CONFLICT'].includes(err.code) ? 409
      : err.code === 'APPROVER_REQUIRED' ? 403 : 500;
    res.status(statusCode).json({ error: err.message, code: err.code });
  }
});
module.exports = router;
