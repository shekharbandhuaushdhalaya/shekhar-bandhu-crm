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

    if (req.query.format === 'csv') {
      let csv = 'Invoice No,Date,Customer Name,GSTIN,Taxable Value (₹),CGST (₹),SGST (₹),IGST (₹),Total Amount (₹)\n';
      invoices.forEach(i => {
        const row = [
          i.invoiceNo || '',
          new Date(i.date).toLocaleDateString('en-IN'),
          `"${(i.customerName || 'Walk-in Customer').replace(/"/g, '""')}"`,
          i.gstin || '',
          (i.baseAmount || 0).toFixed(2),
          (i.cgst || 0).toFixed(2),
          (i.sgst || 0).toFixed(2),
          (i.igst || 0).toFixed(2),
          (i.amount || 0).toFixed(2)
        ];
        csv += row.join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=GSTR1_${y}_${m}.csv`);
      return res.send(csv);
    }

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

    const result = {
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
    };

    if (req.query.format === 'csv') {
      let csv = 'GST Table Section,Taxable Value (₹),Integrated Tax IGST (₹),Central Tax CGST (₹),State Tax SGST (₹),Total GST (₹)\n';
      csv += `3.1 (a) Outward Taxable Supplies,${outwardTaxable.toFixed(2)},${outwardIGST.toFixed(2)},${outwardCGST.toFixed(2)},${outwardSGST.toFixed(2)},${(outwardIGST + outwardCGST + outwardSGST).toFixed(2)}\n`;
      csv += `4 (A) Eligible ITC,${inwardTaxable.toFixed(2)},${inwardIGST.toFixed(2)},${inwardCGST.toFixed(2)},${inwardSGST.toFixed(2)},${(inwardIGST + inwardCGST + inwardSGST).toFixed(2)}\n`;
      
      const netIGST = outwardIGST - inwardIGST;
      const netCGST = outwardCGST - inwardCGST;
      const netSGST = outwardSGST - inwardSGST;
      csv += `Net GST Payable/Refund,${(outwardTaxable - inwardTaxable).toFixed(2)},${netIGST.toFixed(2)},${netCGST.toFixed(2)},${netSGST.toFixed(2)},${(netIGST + netCGST + netSGST).toFixed(2)}\n`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=GSTR3B_${y}_${m}.csv`);
      return res.send(csv);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gst/filing-status — Get ARN details for period
router.get('/filing-status', async (req, res) => {
  try {
    const { period, returnType } = req.query;
    if (!period || !returnType) {
      return res.status(400).json({ error: 'period and returnType are required' });
    }
    const GstFiling = require('../../models/GstFiling');
    const filing = await GstFiling.findOne({ period, returnType }).lean();
    if (!filing) return res.json({ filed: false });
    res.json({ filed: true, filing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gst/filing-status — Save ARN and mark month returns as filed
router.post('/filing-status', async (req, res) => {
  try {
    const { period, returnType, arn, url, name } = req.body;
    if (!period || !returnType || !arn) {
      return res.status(400).json({ error: 'period, returnType, and arn are required' });
    }
    const GstFiling = require('../../models/GstFiling');
    let filing = await GstFiling.findOne({ period, returnType });
    if (!filing) {
      filing = new GstFiling({ period, returnType, arn });
    } else {
      filing.arn = arn;
    }
    filing.filedDate = new Date();
    filing.filedBy = req.user ? req.user.name : 'System Accountant';
    if (url) {
      filing.supportingDocuments = [{ name: name || 'Filing Receipt', url, uploadedAt: new Date() }];
    }
    await filing.save();
    res.status(201).json({ filed: true, filing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
