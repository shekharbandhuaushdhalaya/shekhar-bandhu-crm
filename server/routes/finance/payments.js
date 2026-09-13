const express = require('express');
const mongoose = require('mongoose');
const Payment = require('../../models/Payment');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { createPaymentAndAllocate, allocateExistingPayment, reversePayment } = require('../../services/paymentPostingService');

const router = express.Router();

// GET /api/payments — List payments with optional filters
router.get('/', authorize('payment:view'), async (req, res) => {
  try {
    const { search, type, partyType, partyId, mode, includeReversed } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { referenceNo: { $regex: search, $options: 'i' } }
      ];
    }
    if (type && type !== 'all') filter.type = type;
    if (partyType && partyType !== 'all') filter.partyType = partyType;
    if (includeReversed !== 'true') filter.status = { $ne: 'reversed' };
    
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

// POST /api/payments — Create a new payment and update balances atomically
router.post('/', authorize('payment:create'), validate(schemas.paymentSchema), async (req, res) => {
  try {
    const { type, partyType, partyId, amount, mode, allocations = [] } = req.body;
    if (!type || !partyType || !partyId || !(Number(amount) > 0)) {
      return res.status(400).json({ error: 'Missing or invalid required fields' });
    }
    if (mode === 'cash' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to perform cash transactions.' });
    }
    const { payment } = await createPaymentAndAllocate({ paymentData: req.body, allocations });
    if (req.io) {
      req.io.emit('payment_updated', { type: 'created', id: payment._id });
      if (payment.allocations?.length) req.io.emit('invoice_updated', { type: 'payment_allocated', paymentId: payment._id });
    }
    res.status(201).json(payment);
    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_PAYMENT',
      description: `${type === 'receive' ? 'Received' : 'Made'} payment of ₹${amount} for ${partyType} (Mode: ${(mode || 'regular').toUpperCase()})`,
      details: { id: payment._id }, req
    });
  } catch (err) {
    const status = ['PAYMENT_NOT_FOUND','CUSTOMER_NOT_FOUND','VENDOR_NOT_FOUND','INVOICE_NOT_FOUND'].includes(err.code) ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code || 'PAYMENT_CREATE_FAILED' });
  }
});

// DELETE /api/payments/:id — controlled payment reversal
router.delete('/:id', authorize('payment:create'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.mode === 'cash' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to reverse cash transactions.' });
    }
    const reversed = await reversePayment(req.params.id, req.user?.id || null);
    if (req.io) {
      req.io.emit('payment_updated', { id: req.params.id, type: 'reversed' });
      if (reversed.allocations?.length) req.io.emit('invoice_updated', { type: 'payment_reversed', paymentId: req.params.id });
    }
    const { logAction } = require('../../utils/auditLogger');
    await logAction({ action: 'REVERSE_PAYMENT', description: `Reversed payment ${req.params.id}`, details: { id: req.params.id }, req });
    res.json({ message: 'Payment reversed and balances restored' });
  } catch (err) {
    res.status(err.code === 'PAYMENT_NOT_FOUND' ? 404 : 400).json({ error: err.message, code: err.code || 'PAYMENT_REVERSAL_FAILED' });
  }
});

// GET /api/payments/ageing & GET /api/payments/receivables/ageing — Calculate receivable ageing brackets for B2B invoices
router.get(['/ageing', '/receivables/ageing'], authorize('payment:view'), async (req, res) => {
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
      b90_plus: 0,
      totalOutstanding: 0
    };

    const customerMap = {};

    unpaidInvoices.forEach(inv => {
      const outstanding = Math.max(0, (inv.amount || 0) - (inv.amountPaid || 0));
      if (outstanding <= 0) return;

      brackets.totalOutstanding += outstanding;

      const baseDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date || inv.createdAt);
      const diffTime = now.getTime() - baseDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      let bracket = '0-30';
      if (diffDays <= 30) {
        brackets.b0_30 += outstanding;
        bracket = '0-30';
      } else if (diffDays <= 60) {
        brackets.b31_60 += outstanding;
        bracket = '31-60';
      } else if (diffDays <= 90) {
        brackets.b61_90 += outstanding;
        bracket = '61-90';
      } else {
        brackets.b90_plus += outstanding;
        bracket = '90+';
      }

      const custName = inv.customerName || 'Walk-in Customer';
      if (!customerMap[custName]) {
        customerMap[custName] = {
          customerName: custName,
          totalOutstanding: 0,
          b0_30: 0,
          b31_60: 0,
          b61_90: 0,
          b90_plus: 0,
          invoices: []
        };
      }
      customerMap[custName].totalOutstanding += outstanding;
      if (bracket === '0-30') customerMap[custName].b0_30 += outstanding;
      else if (bracket === '31-60') customerMap[custName].b31_60 += outstanding;
      else if (bracket === '61-90') customerMap[custName].b61_90 += outstanding;
      else customerMap[custName].b90_plus += outstanding;

      customerMap[custName].invoices.push({
        _id: inv._id,
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        dueDate: inv.dueDate || inv.date,
        amount: inv.amount,
        amountPaid: inv.amountPaid || 0,
        balanceDue: outstanding,
        daysOld: diffDays,
        daysOverdue: diffDays,
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

// GET /api/payments/payables/ageing — Calculate payables ageing brackets for vendor purchase invoices
router.get('/payables/ageing', authorize('payment:view'), async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const unpaidPurchaseInvoices = await Invoice.find({
      type: 'purchase',
      isFinalized: true,
      status: { $ne: 'paid' }
    }).sort({ date: -1 }).lean();

    const now = new Date();
    const brackets = {
      b0_30: 0,
      b31_60: 0,
      b61_90: 0,
      b90_plus: 0,
      totalOutstanding: 0
    };

    const vendorMap = {};

    unpaidPurchaseInvoices.forEach(inv => {
      const totalAmt = inv.nettTotal || inv.amount || 0;
      const outstanding = Math.max(0, totalAmt - (inv.amountPaid || 0));
      if (outstanding <= 0) return;

      brackets.totalOutstanding += outstanding;

      const baseDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.date || inv.createdAt);
      const diffTime = now.getTime() - baseDate.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      let bracket = '0-30';
      if (diffDays <= 30) {
        brackets.b0_30 += outstanding;
        bracket = '0-30';
      } else if (diffDays <= 60) {
        brackets.b31_60 += outstanding;
        bracket = '31-60';
      } else if (diffDays <= 90) {
        brackets.b61_90 += outstanding;
        bracket = '61-90';
      } else {
        brackets.b90_plus += outstanding;
        bracket = '90+';
      }

      const vName = inv.partyName || inv.vendorName || inv.supplierName || 'Vendor';
      if (!vendorMap[vName]) {
        vendorMap[vName] = {
          vendorName: vName,
          totalOutstanding: 0,
          invoices: []
        };
      }
      vendorMap[vName].totalOutstanding += outstanding;
      vendorMap[vName].invoices.push({
        _id: inv._id,
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        dueDate: inv.dueDate || inv.date,
        amount: totalAmt,
        amountPaid: inv.amountPaid || 0,
        balanceDue: outstanding,
        daysOld: diffDays,
        daysOverdue: diffDays,
        bracket
      });
    });

    res.json({
      summary: brackets,
      vendors: Object.values(vendorMap).sort((a, b) => b.totalOutstanding - a.totalOutstanding)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/allocate — Match an existing unallocated payment against owned finalized invoices
router.post('/allocate', authorize('payment:create'), validate(schemas.paymentAllocateSchema), async (req, res) => {
  try {
    const payment = await allocateExistingPayment({ paymentId: req.body.paymentId, allocations: req.body.allocations || [] });
    if (req.io) {
      req.io.emit('payment_updated', { type: 'allocated', id: payment._id });
      req.io.emit('invoice_updated', { type: 'allocate', paymentId: payment._id });
    }
    const { logAction } = require('../../utils/auditLogger');
    await logAction({ action: 'ALLOCATE_PAYMENT', description: `Allocated payment ${req.body.paymentId} against invoices`, details: { id: req.body.paymentId }, req });
    res.json({ message: 'Payment successfully allocated bill-wise', payment });
  } catch (err) {
    const status = ['PAYMENT_NOT_FOUND','INVOICE_NOT_FOUND'].includes(err.code) ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code || 'PAYMENT_ALLOCATION_FAILED' });
  }
});

module.exports = router;
