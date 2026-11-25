const express = require('express');
const TrainingRecord = require('../../models/TrainingRecord');
const { authorize } = require('../../middleware/authorize');
const router = express.Router();

router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.topic) {
      const escaped = String(req.query.topic).replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
      filter.topic = new RegExp(escaped, 'i');
    }
    res.json(await TrainingRecord.find(filter).sort({ trainedOn: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('manufacturing:edit'), async (req, res) => {
  try {
    const { userId, topic, trainedOn, validUntil, certificateRef } = req.body;
    if (!userId || !topic || !trainedOn || !validUntil || !certificateRef) return res.status(400).json({ error: 'Operator, training topic, training date, validity date and certificate evidence reference are required' });
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated training recorder identity is required' });
    const start = new Date(trainedOn), end = new Date(validUntil), now = new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > now || end <= start) return res.status(400).json({ error: 'Training dates must be valid; training cannot be future-dated and validity must end after training' });
    const record = await TrainingRecord.create({
      userId, userName: req.body.userName || '', topic: String(topic).trim(),
      trainedOn: start, validUntil: end, trainedBy: req.user.name, trainedByUser: req.user.id,
      certificateRef: String(certificateRef).trim(), status: 'pending_verification'
    });
    res.status(201).json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/verify', authorize('manufacturing:edit'), async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated training reviewer identity is required' });
    const record = await TrainingRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Training record not found' });
    if (String(record.trainedByUser) === String(req.user.id)) return res.status(400).json({ error: 'Independent training evidence review is required' });
    if (record.status !== 'pending_verification') return res.status(400).json({ error: 'Only pending training evidence can be verified' });
    const now = new Date();
    if (!record.topic || !record.trainedOn || new Date(record.trainedOn) > now || !record.validUntil ||
        new Date(record.validUntil) <= now || !record.certificateRef || !record.trainedBy) {
      return res.status(400).json({ error: 'Training evidence is incomplete, expired or invalid' });
    }
    const status = req.body.status || 'verified';
    if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Reviewer disposition must be verified or rejected' });
    record.status = status;
    record.verifiedBy = req.user.id;
    record.verifiedByName = req.user.name;
    record.verifiedAt = now;
    record.verificationNotes = req.body.notes || '';
    await record.save();
    res.json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
