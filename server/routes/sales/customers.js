const express = require('express');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

// GET /api/customers — List customers with optional search filter
router.get('/', async (req, res) => {
  try {
    const { search, page, limit, mode } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (mode === 'cash') {
      filter.$or = filter.$or ? [{ $and: [{ $or: filter.$or }, { gstin: { $in: [null, ''] } }] }] : [{ gstin: { $in: [null, ''] } }];
    } else if (mode === 'gst') {
      filter.gstin = { $nin: [null, ''] };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Customer.find(filter).sort({ createdAt: -1 });
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const customers = await query.lean();

    const sanitized = customers.map(c => {
      if (!req.user || !req.user.canAccessCash) {
        c.cashBalance = 0;
      }
      return c;
    });

    if (isPaginated) {
      const total = await Customer.countDocuments(filter);
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
    if (req.io) {
      req.io.emit('customer_updated', { type: 'created', id: doc._id });
    }
    res.status(201).json(doc);

    await logAction({
      action: 'CREATE_CUSTOMER',
      description: `Created customer: ${doc.company || doc.name} (${doc.gstin || 'No GSTIN'})`,
      details: { customerId: doc._id, name: doc.name, company: doc.company, gstin: doc.gstin },
      req
    });
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
    if (req.io) {
      req.io.emit('customer_updated', { type: 'updated', id: doc._id });
    }
    res.json(doc);

    await logAction({
      action: 'UPDATE_CUSTOMER',
      description: `Updated customer: ${doc.company || doc.name}`,
      details: { customerId: doc._id, changes: Object.keys(req.body) },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/customers/:id — Remove customer
router.delete('/:id', authorize('customer:delete'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.io) {
      req.io.emit('customer_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Customer deleted' });

    await logAction({
      action: 'DELETE_CUSTOMER',
      description: `Deleted customer: ${customer.company || customer.name} (ID: ${customer._id})`,
      details: { customerId: customer._id, name: customer.name, company: customer.company },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/export-csv — Export customers list as CSV format
router.get('/export-csv', async (req, res) => {
  try {
    const customers = await Customer.find({}).lean();
    let csv = 'Name,Company,Email,Phone,GSTIN,State,VolumeTier,CreditLimit,OutstandingBalance\n';

    customers.forEach(c => {
      const name = `"${(c.name || '').replace(/"/g, '""')}"`;
      const company = `"${(c.company || '').replace(/"/g, '""')}"`;
      const email = c.email || '';
      const phone = c.phone || '';
      const gstin = c.gstin || '';
      const state = c.state || '';
      const tier = c.volumeTier || 'none';
      const limit = c.creditLimit || 0;
      const balance = c.regularBalance || 0;
      csv += `${name},${company},${email},${phone},${gstin},${state},${tier},${limit},${balance}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers_export.csv"');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers/import-csv — Import customers from JSON array of CSV rows
router.post('/import-csv', authorize('customer:create'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    let createdCount = 0;
    for (const r of rows) {
      if (r.name || r.company) {
        await Customer.create({
          name: r.name || r.company,
          company: r.company || r.name,
          email: r.email || '',
          phone: r.phone || '',
          gstin: r.gstin || '',
          state: r.state || 'Maharashtra',
          volumeTier: r.volumeTier || 'none',
          creditLimit: Number(r.creditLimit || 0)
        });
        createdCount++;
      }
    }

    res.status(201).json({ message: `Successfully imported ${createdCount} customer(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
