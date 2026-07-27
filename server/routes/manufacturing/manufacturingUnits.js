const express = require('express');
const ManufacturingUnit = require('../../models/ManufacturingUnit');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/manufacturing-units — List all manufacturing units
router.get('/', async (req, res) => {
  try {
    const units = await ManufacturingUnit.find({}).sort({ name: 1 }).lean();
    res.json(units);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing-units — Create a manufacturing unit
router.post('/', validate(schemas.manufacturingUnitSchema), async (req, res) => {
  try {
    const { name, code, addressLine1, city, state, pincode, contactPerson, phone } = req.body;
    
    const existing = await ManufacturingUnit.findOne({
      $or: [
        { name: name.trim() },
        { code: code.trim().toUpperCase() }
      ]
    });
    if (existing) {
      return res.status(400).json({ error: 'Manufacturing unit with this name or code already exists' });
    }

    const unit = await ManufacturingUnit.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      addressLine1: addressLine1 ? addressLine1.trim() : '',
      city: city ? city.trim() : '',
      state: state ? state.trim() : '',
      pincode: pincode ? pincode.trim() : '',
      contactPerson: contactPerson ? contactPerson.trim() : '',
      phone: phone ? phone.trim() : ''
    });

    if (req.io) {
      req.io.emit('mfg_unit_updated', { type: 'created', id: unit._id });
    }
    res.status(201).json(unit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/manufacturing-units/:id — Update a manufacturing unit
router.put('/:id', validate(schemas.manufacturingUnitSchema.partial()), async (req, res) => {
  try {
    const { name, code, addressLine1, city, state, pincode, contactPerson, phone, isActive } = req.body;
    const updateFields = {};

    if (name !== undefined) updateFields.name = name.trim();
    if (code !== undefined) updateFields.code = code.trim().toUpperCase();
    if (addressLine1 !== undefined) updateFields.addressLine1 = addressLine1.trim();
    if (city !== undefined) updateFields.city = city.trim();
    if (state !== undefined) updateFields.state = state.trim();
    if (pincode !== undefined) updateFields.pincode = pincode.trim();
    if (contactPerson !== undefined) updateFields.contactPerson = contactPerson.trim();
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updated = await ManufacturingUnit.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Manufacturing unit not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/manufacturing-units/:id — Delete a manufacturing unit
router.delete('/:id', async (req, res) => {
  try {
    // Check if any batches exist under this unit
    const BatchProduction = require('../../models/BatchProduction');
    const hasBatches = await BatchProduction.countDocuments({ manufacturingUnitId: req.params.id });
    if (hasBatches > 0) {
      return res.status(400).json({ error: 'Cannot delete manufacturing unit with active or historical batch records' });
    }

    const deleted = await ManufacturingUnit.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Manufacturing unit not found' });
    if (req.io) {
      req.io.emit('mfg_unit_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Manufacturing unit deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
