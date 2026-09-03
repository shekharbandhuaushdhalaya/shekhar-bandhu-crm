const express = require('express');
const DripCampaign = require('../../models/DripCampaign');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/drip-campaigns — List drip campaigns
router.get('/', authorize('contact:view'), async (req, res) => {
  try {
    const campaigns = await DripCampaign.find({}).sort({ createdAt: -1 }).lean();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drip-campaigns — Create automated drip campaign
router.post('/', authorize('contact:create'), async (req, res) => {
  try {
    const { name, targetAudience = 'leads', channel = 'whatsapp', steps } = req.body;
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'name and steps array are required' });
    }

    const campaign = await DripCampaign.create({
      name: name.trim(),
      targetAudience,
      channel,
      steps,
      status: 'active'
    });

    res.status(201).json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/drip-campaigns/:id/status — Pause or activate campaign
router.patch('/:id/status', authorize('contact:edit'), async (req, res) => {
  try {
    const { status } = req.body;
    const campaign = await DripCampaign.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
