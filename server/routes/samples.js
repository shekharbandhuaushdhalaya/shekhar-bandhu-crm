const express = require('express');
const router = express.Router();
const Sample = require('../models/Sample');

async function nextSampleNo() {
  const last = await Sample.findOne().sort({ createdAt: -1 }).select('sampleNo');
  if (!last || !last.sampleNo) return 'SMP-001';
  const num = parseInt(last.sampleNo.replace(/\D/g, ''), 10) || 0;
  return `SMP-${String(num + 1).padStart(3, '0')}`;
}

// GET all
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { givenTo: new RegExp(search, 'i') },
      { sampleNo: new RegExp(search, 'i') },
      { location: new RegExp(search, 'i') },
    ];
    const samples = await Sample.find(filter).sort({ createdAt: -1 });
    res.json(samples);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const sampleNo = await nextSampleNo();
    // Compute total MRP value
    const totalMrpValue = (req.body.items || []).reduce((s, item) => s + (item.qty || 0) * (item.mrp || 0), 0);
    const sample = await Sample.create({ ...req.body, sampleNo, totalMrpValue });
    res.status(201).json(sample);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update status
router.patch('/:id', async (req, res) => {
  try {
    const sample = await Sample.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!sample) return res.status(404).json({ error: 'Sample not found' });
    res.json(sample);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Sample.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
