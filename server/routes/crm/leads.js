const express = require('express');
const Lead = require('../../models/Lead');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/leads — List lead opportunities
router.get('/', authorize('contact:view'), async (req, res) => {
  try {
    const { stage, search } = req.query;
    const filter = {};
    if (stage && stage !== 'all') filter.stage = stage;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } }
      ];
    }
    const leads = await Lead.find(filter).sort({ updatedAt: -1 }).lean();
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads — Create new lead opportunity
router.post('/', authorize('contact:create'), async (req, res) => {
  try {
    const { title, customerName, dealValue, stage = 'lead', winProbability, expectedCloseDate, notes } = req.body;
    if (!title || !customerName) {
      return res.status(400).json({ error: 'title and customerName are required' });
    }

    const probMap = { lead: 20, qualification: 40, proposal: 60, negotiation: 80, won: 100, lost: 0 };
    const defaultProb = winProbability !== undefined ? winProbability : (probMap[stage] || 20);

    const lead = await Lead.create({
      ...req.body,
      dealValue: Number(dealValue || 0),
      winProbability: defaultProb
    });

    if (req.io) req.io.emit('lead_updated', { type: 'created', lead });
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/leads/:id/stage — Move lead to new stage
router.patch('/:id/stage', authorize('contact:edit'), async (req, res) => {
  try {
    const { stage, lostReason } = req.body;
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead opportunity not found' });

    const probMap = { lead: 20, qualification: 40, proposal: 60, negotiation: 80, won: 100, lost: 0 };
    lead.stage = stage;
    if (probMap[stage] !== undefined) lead.winProbability = probMap[stage];
    if (lostReason) lead.lostReason = lostReason;

    await lead.save();
    if (req.io) req.io.emit('lead_updated', { type: 'stage_changed', lead });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
