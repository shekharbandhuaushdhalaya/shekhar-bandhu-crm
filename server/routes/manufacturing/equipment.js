const express = require('express');
const Equipment = require('../../models/Equipment');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/idempotency');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/manufacturing/equipment — List equipment and evidence-based calibration status.
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { category, status, manufacturingUnitId } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status && status !== 'all') filter.status = status;
    if (manufacturingUnitId) filter.manufacturingUnitId = manufacturingUnitId;
    const items = await Equipment.find(filter).populate('manufacturingUnitId', 'name').sort({ code: 1 }).lean();
    const now = new Date();
    res.json(items.map(item => {
      const latest = (item.calibrationLogs || []).slice().sort((x, y) => new Date(y.calibratedOn || 0) - new Date(x.calibratedOn || 0))[0];
      const evidenceValid = Boolean(latest && latest.status === 'verified' && latest.verifiedBy && latest.verifiedAt &&
        latest.certificateNo && latest.certificateRef && latest.calibratedByUser && latest.nextDue &&
        new Date(latest.nextDue) > now && item.status === 'active');
      return { ...item, isCalibrationDue: !evidenceValid };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('manufacturing:create'), validate(schemas.equipmentSchema), idempotency, async (req, res) => {
  try {
    const item = await Equipment.create({ ...req.body, status: 'calibration_due', calibrationDueDate: null, calibrationLogs: [] });
    if (req.io) req.io.emit('equipment_updated', { type: 'created', id: item._id });
    res.status(201).json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    if (['calibrationDueDate', 'calibrationLogs', 'status'].some(key => Object.prototype.hasOwnProperty.call(req.body, key))) {
      return res.status(400).json({ error: 'Equipment status and calibration evidence can only be changed through controlled workflows' });
    }
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });
    for (const key of ['name', 'category', 'manufacturingUnitId', 'notes', 'calibrationFrequencyDays']) if (req.body[key] !== undefined) item[key] = req.body[key];
    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'updated', id: item._id });
    res.json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Record calibration evidence; equipment remains unavailable pending independent verification.
router.post('/:id/calibrate', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { certificateNo, certificateRef, calibratedOn, nextCalibrationDue, notes } = req.body;
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated calibration recorder identity is required' });
    if (!certificateNo || !String(certificateNo).trim() || !certificateRef || !String(certificateRef).trim() || !calibratedOn || !nextCalibrationDue) {
      return res.status(400).json({ error: 'Certificate number, certificate evidence reference, calibration date and next due date are required' });
    }
    const calibrationDate = new Date(calibratedOn), nextDue = new Date(nextCalibrationDue), now = new Date();
    if (Number.isNaN(calibrationDate.getTime()) || Number.isNaN(nextDue.getTime()) || calibrationDate > now || nextDue <= now || nextDue <= calibrationDate) {
      return res.status(400).json({ error: 'Calibration dates must be valid; calibration cannot be future-dated and next due must be in the future' });
    }
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });
    if (item.status === 'decommissioned') return res.status(400).json({ error: 'Decommissioned equipment cannot be calibrated or reactivated' });
    item.status = 'calibration_due';
    item.calibrationDueDate = null;
    item.calibrationLogs.unshift({
      calibratedOn: calibrationDate, calibratedBy: req.user.name, calibratedByUser: req.user.id,
      nextDue, certificateNo: String(certificateNo).trim(), certificateRef: String(certificateRef).trim(),
      status: 'pending_verification', notes: notes || ''
    });
    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'calibration_submitted', id: item._id });
    res.status(201).json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Independent reviewer verifies the recorded certificate reference before equipment activation.
router.patch('/:id/calibrations/:index/verify', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated calibration reviewer identity is required' });
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });
    const index = Number(req.params.index);
    const log = Number.isInteger(index) && index >= 0 ? item.calibrationLogs[index] : null;
    if (!log) return res.status(404).json({ error: 'Calibration record not found' });
    if (String(log.calibratedByUser) === String(req.user.id)) return res.status(400).json({ error: 'Independent calibration review is required' });
    if (log.status !== 'pending_verification') return res.status(400).json({ error: 'Only pending calibration evidence can be verified' });
    const now = new Date();
    if (!log.certificateNo || !log.certificateRef || !log.calibratedOn || new Date(log.calibratedOn) > now ||
        !log.nextDue || new Date(log.nextDue) <= now) return res.status(400).json({ error: 'Calibration evidence or validity dates are incomplete or invalid' });
    const disposition = req.body.status || 'verified';
    if (!['verified', 'rejected'].includes(disposition)) return res.status(400).json({ error: 'Reviewer disposition must be verified or rejected' });
    log.status = disposition;
    log.verifiedBy = req.user.id;
    log.verifiedByName = req.user.name;
    log.verifiedAt = now;
    log.verificationNotes = req.body.notes || '';
    if (disposition === 'verified') {
      item.status = 'active';
      item.calibrationDueDate = log.nextDue;
    } else {
      item.status = 'calibration_due';
      item.calibrationDueDate = null;
    }
    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'calibration_reviewed', id: item._id });
    res.json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/maintenance', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { type = 'preventive', details, cost } = req.body;
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated maintenance recorder identity is required' });
    if (!details || !String(details).trim()) return res.status(400).json({ error: 'Maintenance details are required' });
    const item = await Equipment.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment not found' });
    item.lastMaintenanceDate = new Date();
    item.maintenanceLogs.unshift({ maintainedOn: new Date(), maintainedBy: req.user.name, maintainedByUser: req.user.id, type, details: String(details).trim(), cost: Number(cost || 0) });
    if (item.status === 'active') item.status = 'under_maintenance';
    await item.save();
    if (req.io) req.io.emit('equipment_updated', { type: 'maintained', id: item._id });
    res.json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
