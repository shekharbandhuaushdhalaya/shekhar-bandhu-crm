const express = require('express');
const ProductionPlan = require('../../models/ProductionPlan');
const BillOfMaterials = require('../../models/BillOfMaterials');
const InventoryEntry = require('../../models/InventoryEntry');
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

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const planNo = `PLN/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;

    // Aggregate total raw material requirements across all planned batches
    const rawMaterialNeeds = new Map(); // rawMaterialId -> totalNeeded

    for (const pb of plannedBatches) {
      const bom = await BillOfMaterials.findOne({ productId: pb.productId, isActive: true }).lean();
      if (bom && bom.ingredients) {
        const yieldSize = bom.batchYieldQty || 100;
        const multiplier = (pb.plannedQty || 100) / yieldSize;
        for (const ing of bom.ingredients) {
          const rmId = ing.rawMaterialId ? ing.rawMaterialId.toString() : null;
          if (!rmId) continue;
          const needed = (ing.qtyRequired || 0) * multiplier;
          rawMaterialNeeds.set(rmId, (rawMaterialNeeds.get(rmId) || 0) + needed);
        }
      }
    }

    // Check available stock in target warehouse/unit for approved raw materials
    let shortageDetected = false;
    const shortageDetails = [];

    for (const [rmId, requiredQty] of rawMaterialNeeds.entries()) {
      const rm = await RawMaterial.findById(rmId).lean();
      const rmName = rm ? rm.name : 'Raw Material';

      const entries = await InventoryEntry.find({
        warehouseId: manufacturingUnitId,
        rawMaterialId: rmId,
        qcStatus: 'approved'
      }).lean();

      const availableQty = entries.reduce((acc, e) => acc + (e.qtyBoxes || 0), 0);
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
      startDate: new Date(startDate || Date.now()),
      endDate: new Date(endDate || Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    const plan = await ProductionPlan.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!plan) return res.status(404).json({ error: 'Production plan not found' });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
