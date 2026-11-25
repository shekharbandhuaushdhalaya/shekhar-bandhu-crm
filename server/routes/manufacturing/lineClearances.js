const express = require('express');
const mongoose = require('mongoose');
const LineClearance = require('../../models/LineClearance');
const BatchProduction = require('../../models/BatchProduction');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();
const PHASES = ['manufacturing', 'filling', 'packing'];
const CHECKS = ['equipmentCleaned', 'previousMaterialsRemoved', 'previousLabelsDocumentsRemoved', 'areaVisuallyInspected'];

router.get('/', authorize('quality:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.batchId) {
      if (!mongoose.isValidObjectId(req.query.batchId)) return res.status(400).json({ error: 'Invalid batchId' });
      filter.batchId = req.query.batchId;
    }
    if (req.query.phase) {
      if (!PHASES.includes(req.query.phase)) return res.status(400).json({ error: 'Invalid line-clearance phase' });
      filter.phase = req.query.phase;
    }
    res.json(await LineClearance.find(filter).sort({ clearedAt: -1 }).lean());
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', authorize('quality:create'), async (req, res) => {
  try {
    const { batchId, phase, previousBatchNo = '', checklist = {}, notes = '' } = req.body;
    if (!mongoose.isValidObjectId(batchId)) return res.status(400).json({ error: 'A valid batchId is required' });
    if (!PHASES.includes(phase)) return res.status(400).json({ error: 'A valid phase (manufacturing, filling, packing) is required' });
    if (typeof notes !== 'string' || notes.length > 2000) return res.status(400).json({ error: 'Notes must be 2,000 characters or fewer' });
    if (typeof previousBatchNo !== 'string' || previousBatchNo.length > 120) return res.status(400).json({ error: 'previousBatchNo must be 120 characters or fewer' });
    const batch = await BatchProduction.findById(batchId).select('_id manufacturingUnitId');
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });
    if (!req.user?.id) return res.status(403).json({ error: 'Authenticated quality officer identity is required' });
    const normalizedChecklist = Object.fromEntries(CHECKS.map(key => [key, checklist[key] === true]));
    const existing = await LineClearance.findOne({ batchId, phase });
    if (existing && existing.cleared === true) return res.status(409).json({ error: 'Verified line-clearance records are immutable; create a controlled correction record instead' });
    const record = await LineClearance.findOneAndUpdate(
      { batchId, phase },
      { $set: {
        manufacturingUnitId: batch.manufacturingUnitId,
        previousBatchNo: previousBatchNo.trim(),
        checklist: normalizedChecklist,
        notes: notes.trim(),
        cleared: false,
        submittedBy: req.user.id,
        submittedByName: req.user.name || req.user.email || 'Quality Officer',
        submittedAt: new Date(),
        clearedBy: null,
        clearedByName: '',
        clearedAt: null,
        verifiedBy: null,
        verifiedByName: '',
        verifiedAt: null
      } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (req.io) req.io.emit('line_clearance_updated', { batchId, phase, cleared: false });
    res.status(201).json(record);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'A line clearance record already exists for this batch and phase', code: 'LINE_CLEARANCE_CONFLICT' });
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/verify', authorize('quality:approve'), async (req, res) => {
  try {
    if (!req.user?.id || !(req.user.name || req.user.email)) return res.status(403).json({ error: 'Authenticated independent clearance reviewer identity is required' });
    const record = await LineClearance.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Line-clearance record not found' });
    if (record.cleared === true || record.verifiedAt) return res.status(409).json({ error: 'Line-clearance record has already been verified and is immutable' });
    if (!record.submittedBy || String(record.submittedBy) === String(req.user.id)) return res.status(409).json({ error: 'The line-clearance submitter cannot verify their own checklist' });
    if (!CHECKS.every(key => record.checklist && record.checklist[key] === true)) return res.status(409).json({ error: 'All line-clearance checklist items must be completed before independent verification' });
    record.cleared = true;
    record.clearedBy = req.user.id;
    record.clearedByName = req.user.name || req.user.email;
    record.clearedAt = new Date();
    record.verifiedBy = req.user.id;
    record.verifiedByName = req.user.name || req.user.email;
    record.verifiedAt = new Date();
    await record.save();
    if (req.io) req.io.emit('line_clearance_updated', { batchId: record.batchId, phase: record.phase, cleared: true });
    res.json(record);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
