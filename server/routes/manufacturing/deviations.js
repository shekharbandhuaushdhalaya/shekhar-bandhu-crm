const express = require('express');
const DeviationCapa = require('../../models/DeviationCapa');
const BatchProduction = require('../../models/BatchProduction');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/idempotency');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

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
router.post('/', authorize('manufacturing:edit'), validate(schemas.deviationCapaSchema), idempotency, async (req, res) => {
  try {
    const { batchId, deviationType, description, rootCause, correctiveAction, preventiveAction, stageId, stageName } = req.body;

    const batch = await BatchProduction.findById(batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const deviationNo = await generateAtomicDocumentNumber('deviationNo_DEV', 'DEV-', 5);

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
      reportedBy: req.user && req.user.name ? req.user.name : '',
      reportedByUser: req.user && req.user.id ? req.user.id : null
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
router.put('/:id/signoff', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { status = 'resolved', rootCause, correctiveAction, preventiveAction } = req.body;
    const dev = await DeviationCapa.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'Deviation record not found' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated CAPA investigator identity is required' });
    }
    if (!['under_investigation', 'capa_assigned', 'resolved'].includes(status)) {
      return res.status(409).json({ error: 'A deviation cannot be closed or reopened through investigator signoff; use the independent closure verification workflow' });
    }
    if (['closed'].includes(dev.status)) {
      return res.status(409).json({ error: 'Closed deviation records are immutable; create a linked follow-up deviation for new findings' });
    }
    if (dev.reportedByUser && String(dev.reportedByUser) === String(req.user.id) && status === 'resolved') {
      return res.status(409).json({ error: 'Independent CAPA resolution signoff is required; the reporter cannot sign off their own deviation' });
    }
    if (rootCause !== undefined) dev.rootCause = String(rootCause).trim();
    if (correctiveAction !== undefined) dev.correctiveAction = String(correctiveAction).trim();
    if (preventiveAction !== undefined) dev.preventiveAction = String(preventiveAction).trim();
    if (status === 'resolved') {
      if (!String(dev.rootCause || '').trim() || !String(dev.correctiveAction || '').trim() || !String(dev.preventiveAction || '').trim()) {
        return res.status(400).json({ error: 'Root cause, corrective action and preventive action are required before CAPA resolution' });
      }
      if (dev.signedOffBy && String(dev.signedOffBy) !== String(req.user.id)) {
        return res.status(409).json({ error: 'CAPA resolution has already been signed by another investigator' });
      }
      dev.signedOffBy = req.user.id;
      dev.signedOffByName = req.user.name;
      dev.signedOffAt = new Date();
    }
    dev.status = status;
    await dev.save();
    if (req.io) req.io.emit('deviation_updated', { type: status === 'resolved' ? 'resolved' : 'investigation_updated', id: dev._id });
    res.json(dev);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/deviations/:id/verify-closure — independent CAPA effectiveness verification and closure.
router.patch('/:id/verify-closure', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { effectivenessCheck, effectivenessEvidenceRef } = req.body;
    const dev = await DeviationCapa.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: 'Deviation record not found' });
    if (!req.user || !req.user.id || !req.user.name) {
      return res.status(401).json({ error: 'Authenticated independent CAPA verifier identity is required' });
    }
    if (dev.status !== 'resolved' || !dev.signedOffBy || !dev.signedOffAt) {
      return res.status(409).json({ error: 'CAPA must be fully investigated and independently signed as resolved before closure verification' });
    }
    if (String(dev.signedOffBy) === String(req.user.id) ||
      (dev.reportedByUser && String(dev.reportedByUser) === String(req.user.id))) {
      return res.status(409).json({ error: 'Independent CAPA effectiveness verification is required; reporter and resolution signatory cannot verify closure' });
    }
    if (!String(effectivenessCheck || '').trim() || !String(effectivenessEvidenceRef || '').trim()) {
      return res.status(400).json({ error: 'Effectiveness check outcome and supporting evidence reference are required before closure' });
    }
    dev.effectivenessCheck = String(effectivenessCheck).trim();
    dev.effectivenessEvidenceRef = String(effectivenessEvidenceRef).trim();
    dev.closureVerifiedBy = req.user.id;
    dev.closureVerifiedByName = req.user.name;
    dev.closureVerifiedAt = new Date();
    dev.closedAt = new Date();
    dev.status = 'closed';
    await dev.save();
    if (req.io) req.io.emit('deviation_updated', { type: 'closed', id: dev._id });
    res.json(dev);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
