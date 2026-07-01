const express = require('express');
const Customer = require('../models/Customer');

const router = express.Router();

// GET /api/customers — List customers with optional search filter
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 }).lean();
    if (!req.user || !req.user.canAccessCash) {
      const sanitized = customers.map(c => {
        c.kachhaBalance = 0;
        return c;
      });
      return res.json(sanitized);
    }
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers — Create new customer
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    if (!req.user || !req.user.canAccessCash) {
      delete data.kachhaBalance;
    }
    const customer = await Customer.create(data);
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/customers/:id — Update customer details
router.put('/:id', async (req, res) => {
  try {
    const data = { ...req.body };
    if (!req.user || !req.user.canAccessCash) {
      delete data.kachhaBalance;
    }
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const doc = customer.toObject();
    if (!req.user || !req.user.canAccessCash) {
      doc.kachhaBalance = 0;
    }
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/customers/:id — Remove customer
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete customers.' });
    }
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
