const express = require('express');
const BankStatement = require('../../models/BankStatement');
const Payment = require('../../models/Payment');
const Invoice = require('../../models/Invoice');

const router = express.Router();

// GET /api/bank-reconciliation — List statement entries
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
      ];
    }
    const entries = await BankStatement.find(filter).sort({ transactionDate: -1 }).lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bank-reconciliation/import — Import bank statement entries
router.post('/import', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'No entries provided' });
    }

    const created = await BankStatement.insertMany(
      entries.map(e => ({
        ...e,
        transactionDate: new Date(e.transactionDate),
      }))
    );

    res.status(201).json({ message: `Imported ${created.length} entries`, count: created.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/bank-reconciliation/:id/match — Match with payment or invoice
router.post('/:id/match', async (req, res) => {
  try {
    const { paymentId, invoiceId } = req.body;
    const entry = await BankStatement.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    if (paymentId) {
      const payment = await Payment.findById(paymentId);
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      entry.matchedPaymentId = payment._id;
    }
    if (invoiceId) {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
      entry.matchedInvoiceId = invoice._id;
    }

    entry.status = 'matched';
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bank-reconciliation/:id/unmatch
router.post('/:id/unmatch', async (req, res) => {
  try {
    const entry = await BankStatement.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    entry.matchedPaymentId = null;
    entry.matchedInvoiceId = null;
    entry.status = 'unmatched';
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bank-reconciliation/:id/flag
router.post('/:id/flag', async (req, res) => {
  try {
    const entry = await BankStatement.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    entry.status = 'flagged';
    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bank-reconciliation/:id
router.delete('/:id', async (req, res) => {
  try {
    await BankStatement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bank-reconciliation/suggestions — Auto-suggest matches
router.get('/suggestions', async (req, res) => {
  try {
    const unmatched = await BankStatement.find({ status: 'unmatched' }).lean();
    const payments = await Payment.find().sort({ date: -1 }).lean();
    const invoices = await Invoice.find({ isFinalized: true }).sort({ date: -1 }).lean();

    const suggestions = unmatched.map(entry => {
      const matchPayment = payments.find(p => {
        const amountMatch = Math.abs(p.amount - (entry.credit || entry.debit)) < 1;
        const refMatch = p.referenceNo && entry.reference &&
          p.referenceNo.toLowerCase() === entry.reference.toLowerCase();
        return amountMatch || refMatch;
      });

      const matchInvoice = invoices.find(i => {
        const amountMatch = Math.abs(i.amount - (entry.credit || entry.debit)) < 1;
        return amountMatch;
      });

      return {
        entryId: entry._id,
        entryDate: entry.transactionDate,
        entryDescription: entry.description,
        entryAmount: entry.credit || entry.debit,
        suggestedPaymentId: matchPayment?._id || null,
        suggestedPaymentRef: matchPayment?.referenceNo || null,
        suggestedInvoiceId: matchInvoice?._id || null,
        suggestedInvoiceNo: matchInvoice?.invoiceNo || null,
      };
    });

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
