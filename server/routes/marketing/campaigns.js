const express = require('express');
const Campaign = require('../../models/Campaign');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/campaigns — List campaigns
router.get('/', authorize('campaign:view'), async (req, res) => {
  try {
    const { search, status, platform } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (status) filter.status = status;
    if (platform) filter.platform = platform;
    const campaigns = await Campaign.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id — Get single campaign
router.get('/:id', authorize('campaign:view'), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns — Create campaign
router.post('/', authorize('campaign:create'), validate(schemas.campaignSchema), async (req, res) => {
  try {
    const { name, platform, status, startDate, endDate, budget, targetAudience, content, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    const campaign = await Campaign.create({
      name: name.trim(),
      platform: platform || 'social_media',
      status: status || 'draft',
      startDate: startDate || null,
      endDate: endDate || null,
      budget: budget || 0,
      targetAudience: targetAudience || '',
      content: content || '',
      notes: notes || '',
      createdBy: req.user.id,
    });
    const populated = await Campaign.findById(campaign._id)
      .populate('createdBy', 'name email')
      .lean();
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/:id — Update campaign
router.put('/:id', authorize('campaign:edit'), validate(schemas.campaignSchema.partial()), async (req, res) => {
  try {
    const allowed = ['name', 'platform', 'status', 'startDate', 'endDate', 'budget', 'spent', 'targetAudience', 'content', 'notes', 'analytics'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('createdBy', 'name email')
      .lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/launch — Launch/publish a campaign
router.post('/:id/launch', authorize('campaign:publish'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status: 'running', launchedAt: new Date() },
      { new: true }
    ).populate('createdBy', 'name email').lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause — Pause a running campaign
router.post('/:id/pause', authorize('campaign:publish'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status: 'paused' },
      { new: true }
    ).populate('createdBy', 'name email').lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/complete — Mark campaign as completed
router.post('/:id/complete', authorize('campaign:publish'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', completedAt: new Date() },
      { new: true }
    ).populate('createdBy', 'name email').lean();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/:id — Delete campaign
router.delete('/:id', authorize('campaign:delete'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
