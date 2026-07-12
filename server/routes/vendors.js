const express = require('express');
const Vendor = require('../models/Vendor');

const router = express.Router();

// Block all vendor routes for agents
router.use((req, res, next) => {
  if (req.user && req.user.role === 'agent') {
    return res.status(403).json({ error: 'Access denied: Agents cannot access vendor data.' });
  }
  next();
});

// GET /api/vendors — List vendors with optional search filter
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { productCategory: { $regex: search, $options: 'i' } },
      ];
    }

    const vendors = await Vendor.find(filter).sort({ createdAt: -1 }).lean();
    const sanitized = vendors.map(v => {
      v.kachhaBalance = 0;
      return v;
    });
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors — Create new vendor
router.post('/', async (req, res) => {
  try {
    const data = {
      ...req.body,
      // Map name/company correctly if not provided directly
      name: req.body.displayName || req.body.name || '',
      company: req.body.registeredName || req.body.company || '',
    };
    delete data.kachhaBalance;
    const vendor = await Vendor.create(data);
    res.status(201).json(vendor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/vendors/:id — Update vendor details
router.put('/:id', async (req, res) => {
  try {
    const data = {
      ...req.body,
    };
    if (req.body.displayName || req.body.name) {
      data.name = req.body.displayName ?? req.body.name;
    }
    if (req.body.registeredName || req.body.company) {
      data.company = req.body.registeredName ?? req.body.company;
    }
    delete data.kachhaBalance;
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    
    const doc = vendor.toObject();
    doc.kachhaBalance = 0;
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vendors/:id — Remove vendor
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete vendors.' });
    }
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
