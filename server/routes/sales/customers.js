const express = require('express');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

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
        c.cashBalance = 0;
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
router.post('/', validate(schemas.customerSchema), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!req.user || !req.user.canAccessCash) {
      delete data.cashBalance;
    }
    const customer = await Customer.create(data);
    const doc = customer.toObject();
    if (!req.user || !req.user.canAccessCash) {
      doc.cashBalance = 0;
    }
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/customers/:id — Update customer details
router.put('/:id', validate(schemas.customerSchema.partial()), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!req.user || !req.user.canAccessCash) {
      delete data.cashBalance;
    }
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const doc = customer.toObject();
    if (!req.user || !req.user.canAccessCash) {
      doc.cashBalance = 0;
    }
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/customers/:id — Remove customer
router.delete('/:id', authorize('customer:delete'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
