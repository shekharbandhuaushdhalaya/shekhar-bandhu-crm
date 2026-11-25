const express = require('express');
const Invoice = require('../../models/Invoice');
const CreditNote = require('../../models/CreditNote');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

function resolveGstPeriod(req, res) {
  const current = new Date();
  const monthValue = req.query.month;
  const yearValue = req.query.year;
  const monthText = monthValue === undefined ? String(current.getMonth() + 1) : String(monthValue);
  const yearText = yearValue === undefined ? String(current.getFullYear()) : String(yearValue);
  const month = /^\d{1,2}$/.test(monthText) ? Number(monthText) : NaN;
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;

  if (!Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2017 || year > 9999) {
    res.status(400).json({
      error: 'month must be 1–12 and year must be a four-digit year from 2017 onward',
      code: 'GST_REPORT_PERIOD_INVALID'
    });
    return null;
  }

  return { month, year, start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

function sumRecordedBaseAmount(records) {
  return records.reduce((result, record) => {
    if (record.baseAmount === undefined || record.baseAmount === null ||
        !Number.isFinite(Number(record.baseAmount)) || Number(record.baseAmount) < 0) {
      result.unquantifiedCount += 1;
      return result;
    }
    result.value += Number(record.baseAmount);
    return result;
  }, { value: 0, unquantifiedCount: 0 });
}

function recordedNoteBaseAmount(note) {
  return note.baseAmount !== undefined && note.baseAmount !== null &&
    Number.isFinite(Number(note.baseAmount)) && Number(note.baseAmount) >= 0
    ? Number(note.baseAmount)
    : 0;
}

function configuredFirmGstin(settings) {
  // `firmGstin` is the current SystemSettings field; accept the old alias
  // only for backward-compatible migrated settings, never a fabricated value.
  return String(settings?.firmGstin || settings?.gstin || '').trim().toUpperCase();
}

// GET /api/gst/gstr1 — GSTR-1 sales & Credit/Debit Notes summary (monthly)
router.get('/gstr1', authorize('report:view'), async (req, res) => {
  try {
    const period = resolveGstPeriod(req, res);
    if (!period) return;
    const { month: m, year: y, start, end } = period;

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: start, $lt: end },
    }).lean();

    const creditNotes = await CreditNote.find({
      partyType: 'Customer',
      status: 'finalized',
      date: { $gte: start, $lt: end },
    }).lean();

    // B2B invoices (with GSTIN)
    const b2b = invoices.filter(i => i.gstin && i.gstin.trim());
    // B2C invoices (no GSTIN)
    const b2c = invoices.filter(i => !i.gstin || !i.gstin.trim());

    // Calculate gross sales taxes
    const grossBaseResult = sumRecordedBaseAmount(invoices);
    const grossBase = grossBaseResult.value;
    const grossCGST = invoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const grossSGST = invoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const grossIGST = invoices.reduce((s, i) => s + (i.igst || 0), 0);

    // Calculate Credit/Debit Note adjustments (Table 9B)
    const cnList = creditNotes.filter(n => n.type === 'credit_note');
    const dnList = creditNotes.filter(n => n.type === 'debit_note');

    const cnBaseResult = sumRecordedBaseAmount(cnList);
    const cnBase = cnBaseResult.value;
    const cnCGST = cnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const cnSGST = cnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const cnIGST = cnList.reduce((s, n) => s + (n.igst || 0), 0);

    const dnBaseResult = sumRecordedBaseAmount(dnList);
    const dnBase = dnBaseResult.value;
    const dnCGST = dnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const dnSGST = dnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const dnIGST = dnList.reduce((s, n) => s + (n.igst || 0), 0);

    // Net Adjusted Values
    const netBase = grossBase - cnBase + dnBase;
    const netCGST = grossCGST - cnCGST + dnCGST;
    const netSGST = grossSGST - cnSGST + dnSGST;
    const netIGST = grossIGST - cnIGST + dnIGST;

    const b2cBaseResult = sumRecordedBaseAmount(b2c);

    const summary = {
      month: m,
      year: y,
      totalInvoices: invoices.length,
      unquantifiedInvoiceBaseAmountCount: grossBaseResult.unquantifiedCount,
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
        unquantifiedBaseAmountCount: cnBaseResult.unquantifiedCount,
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
          baseAmount: recordedNoteBaseAmount(n),
          baseAmountMissing: n.baseAmount === undefined || n.baseAmount === null || !Number.isFinite(Number(n.baseAmount)) || Number(n.baseAmount) < 0,
          cgst: n.cgst || 0,
          sgst: n.sgst || 0,
          igst: n.igst || 0,
          totalAmount: n.totalAmount || 0
        }))
      },
      table9B_DebitNotes: {
        count: dnList.length,
        baseAmount: dnBase,
        unquantifiedBaseAmountCount: dnBaseResult.unquantifiedCount,
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
          baseAmount: recordedNoteBaseAmount(n),
          baseAmountMissing: n.baseAmount === undefined || n.baseAmount === null || !Number.isFinite(Number(n.baseAmount)) || Number(n.baseAmount) < 0,
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
        taxableValueMissing: i.baseAmount === undefined || i.baseAmount === null || !Number.isFinite(Number(i.baseAmount)) || Number(i.baseAmount) < 0,
        cgst: i.cgst || 0,
        sgst: i.sgst || 0,
        igst: i.igst || 0,
        total: i.amount || 0,
      })),
      b2c: {
        count: b2c.length,
        totalTaxableValue: b2cBaseResult.value,
        unquantifiedBaseAmountCount: b2cBaseResult.unquantifiedCount,
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
router.get('/gstr3b', authorize('report:view'), async (req, res) => {
  try {
    const period = resolveGstPeriod(req, res);
    if (!period) return;
    const { month: m, year: y, start, end } = period;

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

    const saleCreditNotes = await CreditNote.find({
      partyType: 'Customer',
      status: 'finalized',
      date: { $gte: start, $lt: end },
    }).lean();

    const purchaseCreditNotes = await CreditNote.find({
      partyType: 'Vendor',
      status: 'finalized',
      date: { $gte: start, $lt: end },
    }).lean();

    // Outward supplies (sales)
    const grossSalesBaseResult = sumRecordedBaseAmount(saleInvoices);
    const grossSalesTaxable = grossSalesBaseResult.value;
    const grossSalesCGST = saleInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const grossSalesSGST = saleInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const grossSalesIGST = saleInvoices.reduce((s, i) => s + (i.igst || 0), 0);

    // Credit / Debit Notes adjustments for Sales
    const cnList = saleCreditNotes.filter(n => n.type === 'credit_note');
    const dnList = saleCreditNotes.filter(n => n.type === 'debit_note');

    const cnBaseResult = sumRecordedBaseAmount(cnList);
    const cnBase = cnBaseResult.value;
    const cnCGST = cnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const cnSGST = cnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const cnIGST = cnList.reduce((s, n) => s + (n.igst || 0), 0);

    const dnBaseResult = sumRecordedBaseAmount(dnList);
    const dnBase = dnBaseResult.value;
    const dnCGST = dnList.reduce((s, n) => s + (n.cgst || 0), 0);
    const dnSGST = dnList.reduce((s, n) => s + (n.sgst || 0), 0);
    const dnIGST = dnList.reduce((s, n) => s + (n.igst || 0), 0);

    // Net Outward Taxable & Output Tax
    const outwardTaxable = grossSalesTaxable - cnBase + dnBase;
    const outwardCGST = grossSalesCGST - cnCGST + dnCGST;
    const outwardSGST = grossSalesSGST - cnSGST + dnSGST;
    const outwardIGST = grossSalesIGST - cnIGST + dnIGST;

    // Inward supplies (purchases) for ITC
    const grossPurchaseBaseResult = sumRecordedBaseAmount(purchaseInvoices);
    const grossInwardTaxable = grossPurchaseBaseResult.value;
    const grossInwardCGST = purchaseInvoices.reduce((s, i) => s + (i.cgst || 0), 0);
    const grossInwardSGST = purchaseInvoices.reduce((s, i) => s + (i.sgst || 0), 0);
    const grossInwardIGST = purchaseInvoices.reduce((s, i) => s + (i.igst || 0), 0);

    const purchCNList = purchaseCreditNotes.filter(n => n.type === 'credit_note');
    const purchDNList = purchaseCreditNotes.filter(n => n.type === 'debit_note');

    const purchCNBaseResult = sumRecordedBaseAmount(purchCNList);
    const purchCNBase = purchCNBaseResult.value;
    const purchCNCGST = purchCNList.reduce((s, n) => s + (n.cgst || 0), 0);
    const purchCNSGST = purchCNList.reduce((s, n) => s + (n.sgst || 0), 0);
    const purchCNIGST = purchCNList.reduce((s, n) => s + (n.igst || 0), 0);

    const purchDNBaseResult = sumRecordedBaseAmount(purchDNList);
    const purchDNBase = purchDNBaseResult.value;
    const purchDNCGST = purchDNList.reduce((s, n) => s + (n.cgst || 0), 0);
    const purchDNSGST = purchDNList.reduce((s, n) => s + (n.sgst || 0), 0);
    const purchDNIGST = purchDNList.reduce((s, n) => s + (n.igst || 0), 0);

    const inwardTaxable = grossInwardTaxable - purchCNBase + purchDNBase;
    const inwardCGST = grossInwardCGST - purchCNCGST + purchDNCGST;
    const inwardSGST = grossInwardSGST - purchCNSGST + purchDNSGST;
    const inwardIGST = grossInwardIGST - purchCNIGST + purchDNIGST;

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
        unquantifiedCreditDebitNoteBaseAmountCount: cnBaseResult.unquantifiedCount + dnBaseResult.unquantifiedCount,
        unquantifiedInvoiceBaseAmountCount: grossSalesBaseResult.unquantifiedCount,
      },
      inwardSupplies: {
        taxableValue: inwardTaxable,
        itcCGST: inwardCGST,
        itcSGST: inwardSGST,
        itcIGST: inwardIGST,
        totalITC: inwardCGST + inwardSGST + inwardIGST,
        totalRecordedPurchaseTax: inwardCGST + inwardSGST + inwardIGST,
        itcEligibilityVerified: false,
        invoiceCount: purchaseInvoices.length,
        unquantifiedCreditDebitNoteBaseAmountCount: purchCNBaseResult.unquantifiedCount + purchDNBaseResult.unquantifiedCount,
        unquantifiedInvoiceBaseAmountCount: grossPurchaseBaseResult.unquantifiedCount,
      },
      netGSTPayable: (outwardCGST + outwardSGST + outwardIGST) - (inwardCGST + inwardSGST + inwardIGST),
      indicativeTaxDifference: (outwardCGST + outwardSGST + outwardIGST) - (inwardCGST + inwardSGST + inwardIGST),
      taxPayableVerified: false,
      limitations: [
        'This is a CRM preparation summary, not a filed return or portal-validated computation. The net tax difference is indicative only and is not a payment instruction.',
        'Recorded purchase tax is not verified eligible input tax credit; supplier filing status, invoice matching, blocked-credit rules and other statutory conditions are not evaluated.',
        'Credit/debit notes without a recorded taxable base are excluded from taxable-value adjustments and counted as unquantified.'
      ],
    };

    if (req.query.format === 'csv') {
      let csv = 'GST Table Section,Taxable Value (₹),Integrated Tax IGST (₹),Central Tax CGST (₹),State Tax SGST (₹),Total GST (₹)\n';
      csv += `3.1 (a) Outward Taxable Supplies,${outwardTaxable.toFixed(2)},${outwardIGST.toFixed(2)},${outwardCGST.toFixed(2)},${outwardSGST.toFixed(2)},${(outwardIGST + outwardCGST + outwardSGST).toFixed(2)}\n`;
      csv += `Recorded purchase GST (not eligibility-verified),${inwardTaxable.toFixed(2)},${inwardIGST.toFixed(2)},${inwardCGST.toFixed(2)},${inwardSGST.toFixed(2)},${(inwardIGST + inwardCGST + inwardSGST).toFixed(2)}\n`;
      
      const netIGST = outwardIGST - inwardIGST;
      const netCGST = outwardCGST - inwardCGST;
      const netSGST = outwardSGST - inwardSGST;
      csv += `Indicative tax difference (before ITC eligibility review),${(outwardTaxable - inwardTaxable).toFixed(2)},${netIGST.toFixed(2)},${netCGST.toFixed(2)},${netSGST.toFixed(2)},${(netIGST + netCGST + netSGST).toFixed(2)}\n`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=GSTR3B_${y}_${m}.csv`);
      return res.send(csv);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gst/filing-status — Read the recorded filing evidence for a period.
router.get('/filing-status', authorize('report:view'), async (req, res) => {
  try {
    const period = String(req.query.period || '').trim();
    const returnType = String(req.query.returnType || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !['gstr1', 'gstr3b'].includes(returnType)) {
      return res.status(400).json({ error: 'A valid YYYY-MM period and returnType (gstr1 or gstr3b) are required', code: 'GST_FILING_PERIOD_INVALID' });
    }
    const GstFiling = require('../../models/GstFiling');
    const filing = await GstFiling.findOne({ period, returnType }).lean();
    if (!filing) return res.json({ filed: false, evidenceRecorded: false, portalVerified: false });
    // "filed" is retained for compatibility; evidenceRecorded is the authoritative
    // CRM state. Portal verification is deliberately never inferred from ARN entry.
    res.json({ filed: true, evidenceRecorded: true, portalVerified: false, filing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gst/filing-status — Record filing evidence after the external portal submission.
// This endpoint records an operator assertion; it does not submit to or verify the GST portal.
router.post('/filing-status', authorize('invoice:finalize'), async (req, res) => {
  try {
    const period = String(req.body.period || '').trim();
    const returnType = String(req.body.returnType || '').trim();
    const arn = String(req.body.arn || '').trim();
    const actorId = req.user?.id || req.user?._id;
    const actorName = String(req.user?.name || req.user?.email || '').trim();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !['gstr1', 'gstr3b'].includes(returnType) || !arn || arn.length > 64) {
      return res.status(400).json({ error: 'A valid YYYY-MM period, return type, and ARN (1–64 characters) are required', code: 'GST_FILING_EVIDENCE_INVALID' });
    }
    if (!actorId || !actorName) {
      return res.status(403).json({ error: 'Authenticated filing recorder identity is required', code: 'GST_FILING_ACTOR_REQUIRED' });
    }

    const GstFiling = require('../../models/GstFiling');
    const url = String(req.body.url || '').trim();
    const filing = await GstFiling.create({
      period,
      returnType,
      arn,
      filedDate: new Date(),
      filedBy: actorName,
      filedByUserId: actorId,
      snapshot: req.body.snapshot && typeof req.body.snapshot === 'object' && !Array.isArray(req.body.snapshot) ? req.body.snapshot : null,
      supportingDocuments: url ? [{ name: String(req.body.name || 'GST Filing Receipt').trim().slice(0, 120), url: url.slice(0, 2048), uploadedAt: new Date() }] : [],
    });

    if (req.io) {
      req.io.emit('gst_return_updated', { type: 'filing_saved', period, returnType });
    }
    res.status(201).json({ filed: true, evidenceRecorded: true, filing, portalVerified: false });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Filing evidence already exists for this return period and type. Use the formal correction process rather than overwriting it.', code: 'GST_FILING_ALREADY_RECORDED' });
    }
    res.status(500).json({ error: err.message, code: 'GST_FILING_RECORD_FAILED' });
  }
});

// GET /api/gst/gstr1/export-json — Produce a B2B-only GSTR-1 JSON draft; it omits other return sections and is not filing-ready
router.get('/gstr1/export-json', authorize('report:view'), async (req, res) => {
  try {
    const period = resolveGstPeriod(req, res);
    if (!period) return;
    const { month: m, year: y, start, end } = period;

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const gstin = configuredFirmGstin(settings);
    if (!gstin) return res.status(409).json({ error: 'Configure the firm GSTIN before generating GSTR-1 export', code: 'FIRM_GSTIN_REQUIRED' });

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: start, $lt: end },
    }).lean();

    const b2bInvoices = invoices.filter(i => i.gstin && i.gstin.trim());
    const fpStr = `${m.toString().padStart(2, '0')}${y}`;

    // Format B2B section
    const b2bMap = {};
    b2bInvoices.forEach(inv => {
      const ctin = inv.gstin.trim();
      if (!b2bMap[ctin]) b2bMap[ctin] = { ctin, inv: [] };

      const totalTax = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
      const effectiveRate = inv.baseAmount > 0 ? Number(((totalTax / inv.baseAmount) * 100).toFixed(2)) : 0;

      b2bMap[ctin].inv.push({
        inum: inv.invoiceNo,
        idt: new Date(inv.date).toISOString().split('T')[0].split('-').reverse().join('-'),
        val: inv.amount,
        pos: inv.gstin.substring(0, 2),
        rchrg: 'N',
        inv_typ: 'R',
        itms: [
          {
            num: 1,
            itm_det: {
              txval: inv.baseAmount || 0,
              rt: effectiveRate,
              camt: inv.cgst || 0,
              samt: inv.sgst || 0,
              iamt: inv.igst || 0,
              csamt: 0
            }
          }
        ]
      });
    });

    const gstr1Export = {
      gstin,
      fp: fpStr,
      version: 'GST3.0.4',
      // Do not emit a fake portal hash. The authorised filing provider must
      // calculate the final portal-specific hash during submission.
      hash: '',
      b2b: Object.values(b2bMap)
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=GSTR1_${fpStr}.json`);
    res.json(gstr1Export);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gst/gstr3b/export-json — Produce a calculation draft only; purchase GST is not eligibility-verified ITC and is not filing-ready
router.get('/gstr3b/export-json', authorize('report:view'), async (req, res) => {
  try {
    const period = resolveGstPeriod(req, res);
    if (!period) return;
    const { month: m, year: y, start, end } = period;

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const gstin = configuredFirmGstin(settings);
    if (!gstin) return res.status(409).json({ error: 'Configure the firm GSTIN before generating GSTR-3B export', code: 'FIRM_GSTIN_REQUIRED' });

    const [sales, purchases] = await Promise.all([
      Invoice.find({ type: 'sale', isFinalized: true, date: { $gte: start, $lt: end } }).lean(),
      Invoice.find({ type: 'purchase', isFinalized: true, date: { $gte: start, $lt: end } }).lean()
    ]);

    const salesBase = sales.reduce((s, i) => s + (i.baseAmount || 0), 0);
    const salesCGST = sales.reduce((s, i) => s + (i.cgst || 0), 0);
    const salesSGST = sales.reduce((s, i) => s + (i.sgst || 0), 0);
    const salesIGST = sales.reduce((s, i) => s + (i.igst || 0), 0);

    const itcCGST = purchases.reduce((s, i) => s + (i.cgst || 0), 0);
    const itcSGST = purchases.reduce((s, i) => s + (i.sgst || 0), 0);
    const itcIGST = purchases.reduce((s, i) => s + (i.igst || 0), 0);

    const retPeriod = `${m.toString().padStart(2, '0')}${y}`;

    const gstr3bExport = {
      gstin,
      ret_period: retPeriod,
      sec_sum: {
        osup_det: {
          txval: salesBase,
          iamt: salesIGST,
          camt: salesCGST,
          samt: salesSGST,
          csamt: 0
        },
        itc_elg: {
          itc_avl: [
            {
              ty: 'OTH',
              iamt: itcIGST,
              camt: itcCGST,
              samt: itcSGST,
              csamt: 0
            }
          ]
        }
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=GSTR3B_${retPeriod}.json`);
    res.json(gstr3bExport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
