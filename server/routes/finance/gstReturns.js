const express = require('express');
const Invoice = require('../../models/Invoice');

const router = express.Router();

// GET /api/gst/gstr1 — GSTR-1 sales summary (monthly)
router.get('/gstr1', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = month ? parseInt(month) : new Date().getMonth() + 1;
    const y = year ? parseInt(year) : new Date().getFullYear();

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: start, $lt: end },
    }).lean();

    // B2B invoices (with GSTIN)
    const b2b = invoices.filter(i => i.gstin && i.gstin.trim());
    // B2C invoices (no GSTIN)
    const b2c = invoices.filter(i => !i.gstin || !i.gstin.trim());

    const summary = {
      month: m,
      year: y,
      totalInvoices: invoices.length,
      totalTaxableValue: invoices.reduce((s, i) => s + (i.baseAmount || 0), 0),
      totalCGST: invoices.reduce((s, i) => s + (i.cgst || 0), 0),
      totalSGST: invoices.reduce((s, i) => s + (i.sgst || 0), 0),
      totalIGST: invoices.reduce((s, i) => s + (i.igst || 0), 0),
      totalGST: invoices.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0),
      b2b: b2b.map(i => ({
        invoiceNo: i.invoiceNo,
        date: i.date,
        customerName: i.customerName,
        gstin: i.gstin,
        taxableValue: i.baseAmount || 0,
        cgst: i.cgst || 0,
        sgst: i.sgst || 0,
        igst: i.igst || 0,
        total: i.amount || 0,
      })),
      b2c: {
        count: b2c.length,
        totalTaxableValue: b2c.reduce((s, i) => s + (i.baseAmount || 0), 0),
        totalGST: b2c.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0),
      },
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gst/gstr3b — GSTR-3B summary
router.get('/gstr3b', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = month ? parseInt(month) : new Date().getMonth() + 1;
    const y = year ? parseInt(year) : new Date().getFullYear();

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const saleInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: start, $lt: end },
    }).lean();

    const purchaseInvoices = await Invoice.find({
      type: 'purchase',
      isFinalized: true,
      date: { $gte: start, $lt: end },
    }).lean();

    // Outward supplies (sales)
    const outwardTaxable = saleInvoices.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const outwardCGST = saleInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const outwardSGST = saleInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const outwardIGST = saleInvoices.reduce((s, i) => s + (i.igst || 0), 0);
    const outwardTotal = saleInvoices.reduce((s, i) => s + (i.amount || 0), 0);

    // Inward supplies (purchases) for ITC
    const inwardTaxable = purchaseInvoices.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const inwardCGST = purchaseInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const inwardSGST = purchaseInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const inwardIGST = purchaseInvoices.reduce((s, i) => s + (i.igst || 0), 0);
    const inwardTotal = purchaseInvoices.reduce((s, i) => s + (i.amount || 0), 0);

    res.json({
      month: m,
      year: y,
      outwardSupplies: {
        taxableValue: outwardTaxable,
        cgst: outwardCGST,
        sgst: outwardSGST,
        igst: outwardIGST,
        totalTax: outwardCGST + outwardSGST + outwardIGST,
        totalValue: outwardTotal,
        invoiceCount: saleInvoices.length,
      },
      inwardSupplies: {
        taxableValue: inwardTaxable,
        itcCGST: inwardCGST,
        itcSGST: inwardSGST,
        itcIGST: inwardIGST,
        totalITC: inwardCGST + inwardSGST + inwardIGST,
        totalValue: inwardTotal,
        invoiceCount: purchaseInvoices.length,
      },
      netGSTPayable: (outwardCGST + outwardSGST + outwardIGST) - (inwardCGST + inwardSGST + inwardIGST),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
