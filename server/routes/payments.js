const express = require('express');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');

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

    // Enforce cash access security rule
    filter.mode = 'pakka';

    const payments = await Payment.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments — Create a new payment and update balances
router.post('/', async (req, res) => {
  try {
    const { type, partyType, partyId, amount, mode } = req.body;

    if (!type || !partyType || !partyId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }



    const payment = await Payment.create(req.body);

    // Update balances
    if (partyType === 'Customer') {
      const cust = await Customer.findById(partyId);
      if (cust) {
        cust.pakkaBalance += (type === 'receive' ? -amount : amount);
        await cust.save();
      }
    } else if (partyType === 'Vendor') {
      const vend = await Vendor.findById(partyId);
      if (vend) {
        vend.pakkaBalance += (type === 'make' ? -amount : amount);
        await vend.save();
      }
    }

    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/payments/:id — Delete payment and revert balances
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });



    const { type, partyType, partyId, amount, mode } = payment;

    // Revert balances
    if (partyType === 'Customer') {
      const cust = await Customer.findById(partyId);
      if (cust) {
        cust.pakkaBalance += (type === 'receive' ? amount : -amount);
        await cust.save();
      }
    } else if (partyType === 'Vendor') {
      const vend = await Vendor.findById(partyId);
      if (vend) {
        vend.pakkaBalance += (type === 'make' ? amount : -amount);
        await vend.save();
      }
    }

    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment deleted and balance reverted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
