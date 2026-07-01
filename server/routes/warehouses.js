const express = require('express');
const Warehouse = require('../models/Warehouse');
const router = express.Router();

// GET /api/warehouses
router.get('/', async (req, res) => {
  try {
    const warehouses = await Warehouse.find().sort({ name: 1 }).lean();
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warehouses
router.post('/', async (req, res) => {
  try {
    const { name, addressLine1, addressLine2, city, state, pincode, contactPerson, phone } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Warehouse name is required' });
    const exists = await Warehouse.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } }).lean();
    if (exists) return res.status(409).json({ error: 'A warehouse with this name already exists' });
    const warehouse = await Warehouse.create({ name: name.trim(), addressLine1, addressLine2, city, state, pincode, contactPerson, phone });
    res.status(201).json(warehouse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/warehouses/:id
router.put('/:id', async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json(warehouse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/warehouses/:id
router.delete('/:id', async (req, res) => {
  try {
    await Warehouse.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
