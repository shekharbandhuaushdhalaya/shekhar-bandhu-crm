const express = require('express');
const DeviationCapa = require('../../models/DeviationCapa');
const BatchProduction = require('../../models/BatchProduction');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/manufacturing/deviations — List deviations with filters
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { batchId, deviationType, status } = req.query;
    const filter = {};
    if (batchId) filter.batchId = batchId;
    if (deviationType) filter.deviationType = deviationType;
    if (status && status !== 'all') filter.status = status;

    const list = await DeviationCapa.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/deviations — Report new Batch Deviation
router.post('/', authorize('manufacturing:edit'), validate(schemas.deviationCapaSchema), async (req, res) => {
  try {
    const { batchId, deviationType, description, rootCause, correctiveAction, preventiveAction, stageId, stageName } = req.body;

    const batch = await BatchProduction.findById(batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const count = await DeviationCapa.countDocuments();
    const deviationNo = `DEV-${(count + 1).toString().padStart(4, '0')}`;

    const dev = await DeviationCapa.create({
      deviationNo,
      batchId: batch._id,
      batchNo: batch.batchNo,
      stageId: stageId || '',
      stageName: stageName || '',
      deviationType,
      description,
      rootCause: rootCause || '',
      correctiveAction: correctiveAction || '',
      preventiveAction: preventiveAction || '',
      status: 'open',
      reportedBy: req.user ? req.user.name : 'System Accountant'
    });

    if (req.io) {
      req.io.emit('deviation_updated', { type: 'created', id: dev._id });
    }

    res.status(201).json(dev);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/manufacturing/deviations/:id/signoff — Resolve and Sign Off Deviation CAPA
router.put('/:id/signoff', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { status = 'closed', rootCause, correctiveAction, preventiveAction } = req.body;

    const dev = await DeviationCapa.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'Deviation record not found' });

    dev.status = status;
    if (rootCause) dev.rootCause = rootCause;
    if (correctiveAction) dev.correctiveAction = correctiveAction;
    if (preventiveAction) dev.preventiveAction = preventiveAction;
    dev.signedOffBy = req.user ? req.user.id : null;
    dev.signedOffAt = new Date();

    await dev.save();

    if (req.io) {
      req.io.emit('deviation_updated', { type: 'signed_off', id: dev._id });
    }

    res.json(dev);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
