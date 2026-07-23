const express = require('express');
const Invoice = require('../../models/Invoice');
const CreditNote = require('../../models/CreditNote');

const router = express.Router();

// GET /api/gst/gstr1 — GSTR-1 sales & Credit/Debit Notes summary (monthly)
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

    const creditNotes = await CreditNote.find({
      status: 'finalized',
      date: { $gte: start, $lt: end },
    }).lean();

    // B2B invoices (with GSTIN)
    const b2b = invoices.filter(i => i.gstin && i.gstin.trim());
    // B2C invoices (no GSTIN)
    const b2c = invoices.filter(i => !i.gstin || !i.gstin.trim());

    // Calculate gross sales taxes
    const grossBase = invoices.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const grossCGST = invoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const grossSGST = invoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const grossIGST = invoices.reduce((s, i) => s + (i.igst || 0), 0);

    // Calculate Credit/Debit Note adjustments (Table 9B)
    const cnList = creditNotes.filter(n => n.type === 'credit_note');
    const dnList = creditNotes.filter(n => n.type === 'debit_note');

    const cnBase = cnList.reduce((s, n) => s + (n.baseAmount || n.totalAmount || 0), 0);
    const cnCGST = cnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const cnSGST = cnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const cnIGST = cnList.reduce((s, n) => s + (n.igst || 0), 0);

    const dnBase = dnList.reduce((s, n) => s + (n.baseAmount || n.totalAmount || 0), 0);
    const dnCGST = dnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const dnSGST = dnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const dnIGST = dnList.reduce((s, n) => s + (n.igst || 0), 0);

    // Net Adjusted Values
    const netBase = grossBase - cnBase + dnBase;
    const netCGST = grossCGST - cnCGST + dnCGST;
    const netSGST = grossSGST - cnSGST + dnSGST;
    const netIGST = grossIGST - cnIGST + dnIGST;

    const summary = {
      month: m,
      year: y,
      totalInvoices: invoices.length,
      totalTaxableValue: netBase,
      totalCGST: netCGST,
      totalSGST: netSGST,
      totalIGST: netIGST,
      totalGST: netCGST + netSGST + netIGST,
      grossTaxableValue: grossBase,
      grossGST: grossCGST + grossSGST + grossIGST,
      table9B_CreditNotes: {
        count: cnList.length,
        baseAmount: cnBase,
        cgst: cnCGST,
        sgst: cnSGST,
        igst: cnIGST,
        totalAmount: cnList.reduce((s, n) => s + (n.totalAmount || 0), 0),
        items: cnList.map(n => ({
          noteNo: n.noteNo,
          date: n.date,
          partyName: n.partyName,
          invoiceNo: n.invoiceNo,
          reason: n.reason,
          baseAmount: n.baseAmount || n.totalAmount || 0,
          cgst: n.cgst || 0,
          sgst: n.sgst || 0,
          igst: n.igst || 0,
          totalAmount: n.totalAmount || 0
        }))
      },
      table9B_DebitNotes: {
        count: dnList.length,
        baseAmount: dnBase,
        cgst: dnCGST,
        sgst: dnSGST,
        igst: dnIGST,
        totalAmount: dnList.reduce((s, n) => s + (n.totalAmount || 0), 0),
        items: dnList.map(n => ({
          noteNo: n.noteNo,
          date: n.date,
          partyName: n.partyName,
          invoiceNo: n.invoiceNo,
          reason: n.reason,
          baseAmount: n.baseAmount || n.totalAmount || 0,
          cgst: n.cgst || 0,
          sgst: n.sgst || 0,
          igst: n.igst || 0,
          totalAmount: n.totalAmount || 0
        }))
      },
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

// GET /api/gst/gstr3b — GSTR-3B summary (with Credit/Debit Note adjustments)
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

    const creditNotes = await CreditNote.find({
      status: 'finalized',
      date: { $gte: start, $lt: end },
    }).lean();

    // Outward supplies (sales)
    const grossSalesTaxable = saleInvoices.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const grossSalesCGST = saleInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const grossSalesSGST = saleInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const grossSalesIGST = saleInvoices.reduce((s, i) => s + (i.igst || 0), 0);

    // Credit / Debit Notes adjustments
    const cnList = creditNotes.filter(n => n.type === 'credit_note');
    const dnList = creditNotes.filter(n => n.type === 'debit_note');

    const cnBase = cnList.reduce((s, n) => s + (n.baseAmount || n.totalAmount || 0), 0);
    const cnCGST = cnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const cnSGST = cnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const cnIGST = cnList.reduce((s, n) => s + (n.igst || 0), 0);

    const dnBase = dnList.reduce((s, n) => s + (n.baseAmount || n.totalAmount || 0), 0);
    const dnCGST = dnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const dnSGST = dnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const dnIGST = dnList.reduce((s, n) => s + (n.igst || 0), 0);

    // Net Outward Taxable & Output Tax
    const outwardTaxable = grossSalesTaxable - cnBase + dnBase;
    const outwardCGST = grossSalesCGST - cnCGST + dnCGST;
    const outwardSGST = grossSalesSGST - cnSGST + dnSGST;
    const outwardIGST = grossSalesIGST - cnIGST + dnIGST;

    // Inward supplies (purchases) for ITC
    const inwardTaxable = purchaseInvoices.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const inwardCGST = purchaseInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const inwardSGST = purchaseInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const inwardIGST = purchaseInvoices.reduce((s, i) => s + (i.igst || 0), 0);

    res.json({
      month: m,
      year: y,
      outwardSupplies: {
        taxableValue: outwardTaxable,
        cgst: outwardCGST,
        sgst: outwardSGST,
        igst: outwardIGST,
        totalTax: outwardCGST + outwardSGST + outwardIGST,
        invoiceCount: saleInvoices.length,
        creditNotesCount: cnList.length,
        creditNoteDeduction: cnBase,
        debitNotesCount: dnList.length,
        debitNoteAddition: dnBase,
      },
      inwardSupplies: {
        taxableValue: inwardTaxable,
        itcCGST: inwardCGST,
        itcSGST: inwardSGST,
        itcIGST: inwardIGST,
        totalITC: inwardCGST + inwardSGST + inwardIGST,
        invoiceCount: purchaseInvoices.length,
      },
      netGSTPayable: (outwardCGST + outwardSGST + outwardIGST) - (inwardCGST + inwardSGST + inwardIGST),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
