const express = require('express');
const Quotation = require('../models/Quotation');

const router = express.Router();

// GET /api/quotations — List quotations
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { quotationNo: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    const quotations = await Quotation.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(quotations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quotations — Create quotation
router.post('/', async (req, res) => {
  try {
    const data = {
      ...req.body,
      quotationNo: req.body.quotationNo || 'QUOTE-' + Date.now().toString().slice(-6),
    };
    const quotation = await Quotation.create(data);
    res.status(201).json(quotation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/quotations/:id — Edit quotation
router.put('/:id', async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    
    // Keep quotationNo immutable during edits
    const { quotationNo, ...updateData } = req.body;
    Object.assign(quotation, updateData);
    await quotation.save();
    res.json(quotation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/quotations/:id — Delete quotation
router.delete('/:id', async (req, res) => {
  try {
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete quotations.' });
    }
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    
    res.json({ message: 'Quotation deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
