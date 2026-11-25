const express = require('express');
const Invoice = require('../../models/Invoice');
const CreditNote = require('../../models/CreditNote');
const GeneralExpense = require('../../models/GeneralExpense');
const MrExpense = require('../../models/MrExpense');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const start = startDate ? parseDateOnly(startDate) : null;
  const end = endDate ? parseDateOnly(endDate) : null;
  if ((startDate && !start) || (endDate && !end) || (start && end && start > end)) return null;

  const filter = {};
  if (start) filter.$gte = start;
  if (end) {
    const exclusiveEnd = new Date(end);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    filter.$lt = exclusiveEnd;
  }
  return filter;
}

function sumRecordedBaseAmount(records) {
  return records.reduce((result, record) => {
    if (record.baseAmount === undefined || record.baseAmount === null || !Number.isFinite(Number(record.baseAmount))) {
      result.unquantifiedCount += 1;
      return result;
    }
    result.value += Number(record.baseAmount);
    return result;
  }, { value: 0, unquantifiedCount: 0 });
}

function summarizeNotes(notes) {
  const credits = notes.filter(note => note.type === 'credit_note');
  const debits = notes.filter(note => note.type === 'debit_note');
  const creditBase = sumRecordedBaseAmount(credits);
  const debitBase = sumRecordedBaseAmount(debits);
  return {
    creditNotes: { count: credits.length, taxableValue: Number(creditBase.value.toFixed(2)), unquantifiedCount: creditBase.unquantifiedCount },
    debitNotes: { count: debits.length, taxableValue: Number(debitBase.value.toFixed(2)), unquantifiedCount: debitBase.unquantifiedCount },
    netAdjustment: Number((debitBase.value - creditBase.value).toFixed(2))
  };
}

// GET /api/finance/reports/pnl
// This is deliberately a management summary, not a statutory or accounting P&L.
// Purchases are not COGS without inventory valuation/consumption and opening/closing stock.
router.get('/pnl', authorize('report:view'), async (req, res) => {
  try {
    const dateFilter = buildDateFilter(req.query.startDate, req.query.endDate);
    if (dateFilter === null) {
      return res.status(400).json({
        error: 'startDate and endDate must be valid YYYY-MM-DD dates and startDate cannot follow endDate',
        code: 'FINANCIAL_REPORT_DATE_RANGE_INVALID'
      });
    }
    const dateQuery = Object.keys(dateFilter).length ? { date: dateFilter } : {};
    const invoiceQuery = { isFinalized: true, ...dateQuery };
    const noteQuery = { status: 'finalized', ...dateQuery };

    const [salesInvoices, purchaseInvoices, customerNotes, vendorNotes, generalExpenses, approvedMrExpenses] = await Promise.all([
      Invoice.find({ ...invoiceQuery, type: 'sale' }).lean(),
      Invoice.find({ ...invoiceQuery, type: 'purchase' }).lean(),
      CreditNote.find({ ...noteQuery, partyType: 'Customer' }).lean(),
      CreditNote.find({ ...noteQuery, partyType: 'Vendor' }).lean(),
      GeneralExpense.find(dateQuery).lean(),
      MrExpense.find({ ...dateQuery, status: 'approved' }).lean()
    ]);

    const sales = sumRecordedBaseAmount(salesInvoices);
    const purchases = sumRecordedBaseAmount(purchaseInvoices);
    const customerAdjustments = summarizeNotes(customerNotes);
    const vendorAdjustments = summarizeNotes(vendorNotes);
    const generalExpenseTotal = generalExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const approvedMrExpenseTotal = approvedMrExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const netSalesTaxableValue = sales.value + customerAdjustments.netAdjustment;
    const netPurchaseTaxableValue = purchases.value + vendorAdjustments.netAdjustment;
    const recordedOperatingExpenses = generalExpenseTotal + approvedMrExpenseTotal;

    res.json({
      reportBasis: 'management_summary_not_accounting_profit_and_loss',
      period: {
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null
      },
      revenue: {
        finalizedSalesInvoiceCount: salesInvoices.length,
        grossTaxableValue: Number(sales.value.toFixed(2)),
        customerCreditDebitNotes: customerAdjustments,
        netTaxableValue: Number(netSalesTaxableValue.toFixed(2)),
        invoicesMissingTaxableValue: sales.unquantifiedCount
      },
      purchases: {
        finalizedPurchaseInvoiceCount: purchaseInvoices.length,
        grossTaxableValue: Number(purchases.value.toFixed(2)),
        vendorCreditDebitNotes: vendorAdjustments,
        netTaxableValue: Number(netPurchaseTaxableValue.toFixed(2)),
        invoicesMissingTaxableValue: purchases.unquantifiedCount,
        classification: 'purchase_value_not_cost_of_goods_sold'
      },
      recordedExpenses: {
        generalExpenseCount: generalExpenses.length,
        generalExpenseTotal: Number(generalExpenseTotal.toFixed(2)),
        approvedMrExpenseCount: approvedMrExpenses.length,
        approvedMrExpenseTotal: Number(approvedMrExpenseTotal.toFixed(2)),
        total: Number(recordedOperatingExpenses.toFixed(2))
      },
      limitations: [
        'This summary is not a statutory return or a complete accounting profit-and-loss statement.',
        'Purchase invoices are not treated as cost of goods sold; opening/closing inventory and batch-level consumption valuation are not reconciled here.',
        'Only recorded base amounts are included; records without a base amount are counted as unquantified rather than substituting tax-inclusive totals.',
        'Only approved medical-representative expenses are included; other unrecorded accruals, depreciation, payroll and tax adjustments are outside this report.'
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'FINANCIAL_REPORT_FAILED' });
  }
});

module.exports = router;
