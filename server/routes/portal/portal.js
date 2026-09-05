const express = require('express');
const Invoice = require('../../models/Invoice');
const { authenticatePortalCustomer } = require('../../middleware/authenticatePortalCustomer');

const router = express.Router();

// Apply customer portal authentication middleware to all routes in this router
router.use(authenticatePortalCustomer);

// GET /api/portal/invoices — List only logged-in customer's invoices
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find({
      type: 'sale',
      $or: [
        { customerId: req.customer._id },
        { customerName: req.customer.name }
      ]
    }).sort({ date: -1 }).lean();

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/invoices/:id/pdf — PDF/Summary of customer's invoice (enforces ownership)
router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const belongsToCustomer = (invoice.customerId && invoice.customerId.toString() === req.customer._id.toString()) ||
      (invoice.customerName && invoice.customerName.toLowerCase() === req.customer.name.toLowerCase());

    if (!belongsToCustomer) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this invoice' });
    }

    // Format PDF invoice data structure for downloading/printing
    res.json({
      title: `TAX INVOICE ${invoice.invoiceNo}`,
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      customerName: invoice.customerName,
      billingAddress: invoice.partyAddress || req.customer.billingAddress,
      items: invoice.items || [],
      subTotal: invoice.baseAmount || invoice.amount,
      cgst: invoice.cgst || 0,
      sgst: invoice.sgst || 0,
      igst: invoice.igst || 0,
      tcsAmount: invoice.tcsAmount || 0,
      grandTotal: invoice.amount || invoice.nettTotal,
      amountPaid: invoice.amountPaid || 0,
      balanceDue: Math.max(0, (invoice.amount || 0) - (invoice.amountPaid || 0)),
      status: invoice.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/receivables-ageing — Ageing breakdown for logged-in customer
router.get('/receivables-ageing', async (req, res) => {
  try {
    const unpaidInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      status: { $in: ['unpaid', 'partially_paid'] },
      $or: [
        { customerId: req.customer._id },
        { customerName: req.customer.name }
      ]
    }).lean();

    const now = new Date();
    let current = 0;
    let days31To60 = 0;
    let days61To90 = 0;
    let days90Plus = 0;

    const invoiceBreakdown = unpaidInvoices.map(inv => {
      const balance = Math.max(0, (inv.amount || inv.nettTotal || 0) - (inv.amountPaid || 0));
      const invDate = inv.dueDate ? new Date(inv.dueDate) : (inv.date ? new Date(inv.date) : now);
      const ageDays = Math.floor((now - invDate) / (1000 * 60 * 60 * 24));

      if (ageDays <= 30) current += balance;
      else if (ageDays <= 60) days31To60 += balance;
      else if (ageDays <= 90) days61To90 += balance;
      else days90Plus += balance;

      return {
        id: inv._id,
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        dueDate: inv.dueDate,
        totalAmount: inv.amount,
        balanceDue: balance,
        ageDays: Math.max(0, ageDays)
      };
    });

    const totalOutstanding = current + days31To60 + days61To90 + days90Plus;

    res.json({
      customerId: req.customer._id,
      customerName: req.customer.name,
      totalOutstanding,
      brackets: {
        current,
        days31To60,
        days61To90,
        days90Plus
      },
      invoices: invoiceBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
