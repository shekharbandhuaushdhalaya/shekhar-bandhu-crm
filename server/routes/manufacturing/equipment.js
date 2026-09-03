const express = require('express');
const Equipment = require('../../models/Equipment');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/manufacturing/equipment — List equipment with status & category filter
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { category, status, manufacturingUnitId } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status && status !== 'all') filter.status = status;
    if (manufacturingUnitId) filter.manufacturingUnitId = manufacturingUnitId;

    const items = await Equipment.find(filter).populate('manufacturingUnitId', 'name').sort({ code: 1 }).lean();
    
    const now = new Date();
    const enriched = items.map(eq => {
      const isCalibrationDue = eq.calibrationDueDate ? new Date(eq.calibrationDueDate) <= now : false;
      return {
        ...eq,
        isCalibrationDue
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/equipment — Register new GMP Equipment
router.post('/', authorize('manufacturing:create'), validate(schemas.equipmentSchema), async (req, res) => {
  try {
    const item = await Equipment.create(req.body);
    if (req.io) {
      req.io.emit('equipment_updated', { type: 'created', id: item._id });
    }
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/manufacturing/equipment/:id — Update equipment status/calibration
router.put('/:id', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const item = await Equipment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Equipment not found' });
    if (req.io) {
      req.io.emit('equipment_updated', { type: 'updated', id: item._id });
    }
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
