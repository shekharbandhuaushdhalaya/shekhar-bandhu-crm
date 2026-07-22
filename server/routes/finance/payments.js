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

module.exports = router;
