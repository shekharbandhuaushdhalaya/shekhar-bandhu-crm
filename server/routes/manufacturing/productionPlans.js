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
      const yieldSize = Number(bom.batchYieldQty) || 100;
      if (yieldSize <= 0) {
        return res.status(400).json({ error: `Active recipe for ${pb.productName || pb.productId} has an invalid batch yield` });
      }
      const multiplier = Number(pb.plannedQty) / yieldSize;
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
        qcStatus: 'approved'
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
      plannedBatches,
      rawMaterialSufficiencyStatus: shortageDetected ? 'shortage_detected' : 'sufficient',
      shortageDetails,
      status: 'draft',
      plannerName: req.user ? req.user.name : 'System',
      notes: notes || ''
    });

    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/production-plans/:id/status — Update plan status
router.patch('/:id/status', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['draft', 'approved', 'in_production', 'completed', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid production plan status' });
    }
    const plan = await ProductionPlan.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!plan) return res.status(404).json({ error: 'Production plan not found' });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
