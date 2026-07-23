const express = require('express');
const mongoose = require('mongoose');
const Payment = require('../../models/Payment');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/payments — List payments with optional filters
router.get('/', async (req, res) => {
  try {
    const { search, type, partyType, partyId, mode } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { referenceNo: { $regex: search, $options: 'i' } }
      ];
    }
    if (type && type !== 'all') filter.type = type;
    if (partyType && partyType !== 'all') filter.partyType = partyType;
    
    if (partyId) {
      if (mongoose.Types.ObjectId.isValid(partyId)) {
        filter.partyId = partyId;
      } else {
        filter.partyName = { $regex: partyId, $options: 'i' };
      }
    }

    // Cash access gating — restrict non-cash users to regular payments only
    if (!req.user || !req.user.canAccessCash) {
      filter.mode = 'regular';
    } else if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const payments = await Payment.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments — Create a new payment and update balances
router.post('/', validate(schemas.paymentSchema), async (req, res) => {
  try {
    const { type, partyType, partyId, amount, mode } = req.body;

    if (!type || !partyType || !partyId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Cash access gating
    if (mode === 'cash' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to perform cash transactions.' });
    }

    const payment = await Payment.create(req.body);

    // Update balances — branch on mode
    if (partyType === 'Customer') {
      const cust = await Customer.findById(partyId);
      if (cust) {
        if (mode === 'cash') {
          cust.cashBalance += (type === 'receive' ? -amount : amount);
        } else {
          cust.regularBalance += (type === 'receive' ? -amount : amount);
        }
        await cust.save();
      }
    } else if (partyType === 'Vendor') {
      const vend = await Vendor.findById(partyId);
      if (vend) {
        if (mode === 'cash') {
          vend.cashBalance += (type === 'make' ? -amount : amount);
        } else {
          vend.regularBalance += (type === 'make' ? -amount : amount);
        }
        await vend.save();
      }
    }

    res.status(201).json(payment);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_PAYMENT',
      description: `${type === 'receive' ? 'Received' : 'Made'} payment of ₹${amount} for ${partyType} (Mode: ${(mode || 'regular').toUpperCase()})`,
      details: { id: payment._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/payments/:id — Delete payment and revert balances
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Cash access gating
    if (payment.mode === 'cash' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to delete cash transactions.' });
    }

    const { type, partyType, partyId, amount, mode } = payment;

    // Revert balances — branch on mode
    if (partyType === 'Customer') {
      const cust = await Customer.findById(partyId);
      if (cust) {
        if (mode === 'cash') {
          cust.cashBalance += (type === 'receive' ? amount : -amount);
        } else {
          cust.regularBalance += (type === 'receive' ? amount : -amount);
        }
        await cust.save();
      }
    } else if (partyType === 'Vendor') {
      const vend = await Vendor.findById(partyId);
      if (vend) {
        if (mode === 'cash') {
          vend.cashBalance += (type === 'make' ? amount : -amount);
        } else {
          vend.regularBalance += (type === 'make' ? amount : -amount);
        }
        await vend.save();
      }
    }

    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment deleted and balance reverted' });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'DELETE_PAYMENT',
      description: `Deleted ${type === 'receive' ? 'received' : 'made'} payment of ₹${amount} (Mode: ${(mode || 'regular').toUpperCase()})`,
      details: { id: payment._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/ageing — Calculate receivable ageing brackets for B2B invoices
router.get('/ageing', async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const unpaidInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      status: { $ne: 'paid' }
    }).sort({ date: -1 }).lean();

    const now = new Date();
    const brackets = {
      b0_30: 0,
      b31_60: 0,
      b61_90: 0,
      b90_plus: 0
    };

    const customerMap = {};

    unpaidInvoices.forEach(inv => {
      const outstanding = inv.amount - (inv.amountPaid || 0);
      if (outstanding <= 0) return;

      const diffTime = Math.abs(now.getTime() - new Date(inv.date).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let bracket = 'b0_30';
      if (diffDays <= 30) {
        brackets.b0_30 += outstanding;
        bracket = '0-30 Days';
      } else if (diffDays <= 60) {
        brackets.b31_60 += outstanding;
        bracket = '31-60 Days';
      } else if (diffDays <= 90) {
        brackets.b61_90 += outstanding;
        bracket = '61-90 Days';
      } else {
        brackets.b90_plus += outstanding;
        bracket = '90+ Days';
      }

      const custName = inv.customerName || 'Walk-in Customer';
      if (!customerMap[custName]) {
        customerMap[custName] = {
          customerName: custName,
          totalOutstanding: 0,
          invoices: []
        };
      }
      customerMap[custName].totalOutstanding += outstanding;
      customerMap[custName].invoices.push({
        _id: inv._id,
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        amount: inv.amount,
        amountPaid: inv.amountPaid || 0,
        outstanding,
        daysOld: diffDays,
        bracket
      });
    });

    res.json({
      summary: brackets,
      customers: Object.values(customerMap).sort((a, b) => b.totalOutstanding - a.totalOutstanding)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/allocate — Match payment receipt against outstanding invoices (bill-wise)
router.post('/allocate', async (req, res) => {
  try {
    const { paymentId, allocations } = req.body; // allocations: [{ invoiceId, amount }]
    if (!paymentId || !allocations || !allocations.length) {
      return res.status(400).json({ error: 'paymentId and allocations list are required' });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment receipt record not found' });

    const Invoice = require('../../models/Invoice');
    for (const alloc of allocations) {
      const inv = await Invoice.findById(alloc.invoiceId);
      if (inv) {
        inv.payments = inv.payments || [];
        inv.payments.push({
          paymentId: payment._id,
          amountAllocated: alloc.amount,
          allocatedAt: new Date()
        });
        inv.amountPaid = (inv.amountPaid || 0) + alloc.amount;
        inv.status = inv.amountPaid >= inv.amount ? 'paid' : 'partially_paid';
        await inv.save();
      }
    }

    res.json({ message: 'Payment successfully allocated bill-wise', payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
