const express = require('express');
const Invoice = require('../../models/Invoice');
const GeneralExpense = require('../../models/GeneralExpense');
const MrExpense = require('../../models/MrExpense');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/finance/reports/pnl — Full P&L (Profit & Loss) Statement & Chart of Accounts Summary
router.get('/pnl', authorize('report:view'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const invoiceQuery = { isFinalized: true };
    const expenseQuery = {};
    if (startDate || endDate) {
      invoiceQuery.date = dateFilter;
      expenseQuery.date = dateFilter;
    }

    // 1. Sales Revenue
    const salesInvoices = await Invoice.find({ ...invoiceQuery, type: 'sale' }).lean();
    const grossSalesRevenue = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);

    // 2. Cost of Goods Sold (COGS) — Vendor Purchases
    const purchaseInvoices = await Invoice.find({ ...invoiceQuery, type: 'purchase' }).lean();
    const totalPurchasesCost = purchaseInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);

    const grossProfit = grossSalesRevenue - totalPurchasesCost;

    // 3. Operating Expenses — General Office Expenses + MR Field Expenses
    const generalExpenses = await GeneralExpense.find(expenseQuery).lean();
    const mrExpenses = await MrExpense.find(expenseQuery).lean();

    const totalGeneralOfficeExpenses = generalExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const totalMrFieldExpenses = mrExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const totalOperatingExpenses = totalGeneralOfficeExpenses + totalMrFieldExpenses;

    const netProfit = grossProfit - totalOperatingExpenses;
    const netProfitMarginPercent = grossSalesRevenue > 0 ? Number(((netProfit / grossSalesRevenue) * 100).toFixed(1)) : 0;

    res.json({
      revenue: {
        grossSalesRevenue: Number(grossSalesRevenue.toFixed(2)),
        totalSalesInvoicesCount: salesInvoices.length
      },
      cogs: {
        totalPurchasesCost: Number(totalPurchasesCost.toFixed(2)),
        totalPurchaseInvoicesCount: purchaseInvoices.length
      },
      grossProfit: Number(grossProfit.toFixed(2)),
      operatingExpenses: {
        totalGeneralOfficeExpenses: Number(totalGeneralOfficeExpenses.toFixed(2)),
        totalMrFieldExpenses: Number(totalMrFieldExpenses.toFixed(2)),
        totalOperatingExpenses: Number(totalOperatingExpenses.toFixed(2))
      },
      netProfit: Number(netProfit.toFixed(2)),
      netProfitMarginPercent
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
