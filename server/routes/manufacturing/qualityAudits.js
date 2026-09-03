const express = require('express');
const InternalAudit = require('../../models/InternalAudit');
const TrainingRecord = require('../../models/TrainingRecord');
const User = require('../../models/User');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// --- Internal Audits ---

// GET /api/manufacturing/quality-audits/internal-audits — List internal self-inspection audits
router.get('/internal-audits', authorize('manufacturing:audit'), async (req, res) => {
  try {
    const { status, manufacturingUnitId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (manufacturingUnitId) filter.manufacturingUnitId = manufacturingUnitId;

    const audits = await InternalAudit.find(filter).sort({ scheduledDate: -1 }).lean();
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/quality-audits/internal-audits — Schedule/create internal audit
router.post('/internal-audits', authorize('manufacturing:audit'), async (req, res) => {
  try {
    const { manufacturingUnitId, scheduledDate, auditors, scope, findings } = req.body;
    if (!manufacturingUnitId || !scheduledDate) {
      return res.status(400).json({ error: 'manufacturingUnitId and scheduledDate are required' });
    }

    const audit = await InternalAudit.create({
      manufacturingUnitId,
      scheduledDate: new Date(scheduledDate),
      auditors: auditors || [],
      scope: scope || '',
      findings: findings || [],
      status: 'scheduled'
    });

    res.status(201).json(audit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/quality-audits/internal-audits/:id — Update internal audit status/findings
router.patch('/internal-audits/:id', authorize('manufacturing:audit'), async (req, res) => {
  try {
    const { status, completedDate, findings } = req.body;

    const audit = await InternalAudit.findById(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Internal audit record not found' });

    if (status) audit.status = status;
    if (completedDate) audit.completedDate = new Date(completedDate);
    if (findings && Array.isArray(findings)) audit.findings = findings;

    await audit.save();
    res.json(audit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- Training Records ---

// GET /api/manufacturing/quality-audits/training-records — List staff training records
router.get('/training-records', authorize('manufacturing:audit'), async (req, res) => {
  try {
    const { userId, topic } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (topic) filter.topic = { $regex: topic, $options: 'i' };

    const records = await TrainingRecord.find(filter).sort({ trainedOn: -1 }).lean();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/quality-audits/training-records — Log staff training session
router.post('/training-records', authorize('manufacturing:audit'), async (req, res) => {
  try {
    const { userId, topic, trainedOn, trainedBy, validUntil, certificateRef } = req.body;
    if (!userId || !topic || !trainedOn) {
      return res.status(400).json({ error: 'userId, topic, and trainedOn are required' });
    }

    const user = await User.findById(userId);
    const userName = user ? user.name : '';

    const record = await TrainingRecord.create({
      userId,
      userName,
      topic: topic.trim(),
      trainedOn: new Date(trainedOn),
      trainedBy: trainedBy ? trainedBy.trim() : (req.user ? req.user.name : ''),
      validUntil: validUntil ? new Date(validUntil) : null,
      certificateRef: certificateRef || ''
    });

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
