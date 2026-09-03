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

// POST /api/manufacturing/equipment/:id/calibrate — Record calibration completion
router.post('/:id/calibrate', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { certificateNo, calibratedBy, nextCalibrationDue, notes } = req.body;
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });

    const calibratedOn = new Date();
    const nextDue = nextCalibrationDue ? new Date(nextCalibrationDue) : new Date(calibratedOn.getTime() + (item.calibrationFrequencyDays || 180) * 24 * 60 * 60 * 1000);

    item.calibrationDueDate = nextDue;
    item.status = 'active';
    item.calibrationLogs.unshift({
      calibratedOn,
      calibratedBy: calibratedBy || req.user?.name || 'QC Inspector',
      nextDue,
      certificateNo: certificateNo || 'CAL-' + Date.now().toString().slice(-6),
      notes: notes || ''
    });

    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'calibrated', id: item._id });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/equipment/:id/maintenance — Record maintenance log
router.post('/:id/maintenance', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { type = 'preventive', details, cost, maintainedBy } = req.body;
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });

    item.lastMaintenanceDate = new Date();
    item.maintenanceLogs.unshift({
      maintainedOn: new Date(),
      maintainedBy: maintainedBy || req.user?.name || 'Engineer',
      type,
      details: details || '',
      cost: Number(cost || 0)
    });

    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'maintained', id: item._id });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
