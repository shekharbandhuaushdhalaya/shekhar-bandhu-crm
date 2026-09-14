const express = require('express');
const Vendor = require('../../models/Vendor');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

// GET /api/vendors — List vendors with optional search filter
router.get('/', authorize('vendor:view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { productCategory: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Vendor.find(filter).sort({ createdAt: -1 });
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const vendors = await query.lean();
    const sanitized = vendors.map(v => {
      v.cashBalance = 0;
      return v;
    });

    if (isPaginated) {
      const total = await Vendor.countDocuments(filter);
      return res.json({
        data: sanitized,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors — Create new vendor
router.post('/', authorize('vendor:create'), validate(schemas.vendorSchema), async (req, res) => {
  try {
    const data = {
      ...req.body,
      name: req.body.displayName || req.body.name || '',
      company: req.body.registeredName || req.body.company || '',
    };
    delete data.cashBalance;
    const vendor = await Vendor.create(data);
    if (req.io) {
      req.io.emit('vendor_updated', { type: 'created', id: vendor._id });
    }
    res.status(201).json(vendor);

    await logAction({
      action: 'CREATE_VENDOR',
      description: `Created vendor: ${vendor.company || vendor.name} (${vendor.gstin || 'No GSTIN'})`,
      details: { vendorId: vendor._id, name: vendor.name, company: vendor.company },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/vendors/:id — Update vendor details
router.put('/:id', authorize('vendor:edit'), validate(schemas.vendorSchema.partial()), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.body.displayName || req.body.name) {
      data.name = req.body.displayName ?? req.body.name;
    }
    if (req.body.registeredName || req.body.company) {
      data.company = req.body.registeredName ?? req.body.company;
    }
    delete data.cashBalance;
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const doc = vendor.toObject();
    doc.cashBalance = 0;
    if (req.io) {
      req.io.emit('vendor_updated', { type: 'updated', id: doc._id });
    }
    res.json(doc);

    await logAction({
      action: 'UPDATE_VENDOR',
      description: `Updated vendor: ${doc.company || doc.name}`,
      details: { vendorId: doc._id, changes: Object.keys(req.body) },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vendors/:id — Remove vendor
router.delete('/:id', authorize('vendor:delete'), async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (req.io) {
      req.io.emit('vendor_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Vendor deleted' });

    await logAction({
      action: 'DELETE_VENDOR',
      description: `Deleted vendor: ${vendor.company || vendor.name} (ID: ${vendor._id})`,
      details: { vendorId: vendor._id, name: vendor.name, company: vendor.company },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
