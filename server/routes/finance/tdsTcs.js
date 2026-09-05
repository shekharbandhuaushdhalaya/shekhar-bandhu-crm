const express = require('express');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/finance/tds-tcs-summary — Total TCS collected grouped by month & customer
router.get('/tds-tcs-summary', authorize('report:view'), async (req, res) => {
  try {
    const tcsInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      $or: [
        { tcsApplicable: true },
        { tcsAmount: { $gt: 0 } }
      ]
    }).sort({ date: -1 }).lean();

    let totalTcsCollected = 0;
    const monthMap = {};
    const customerMap = {};

    for (const inv of tcsInvoices) {
      const tcs = inv.tcsAmount || 0;
      const salesAmt = inv.amount || inv.nettTotal || 0;
      totalTcsCollected += tcs;

      const d = inv.date ? new Date(inv.date) : new Date();
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { month: monthKey, totalTcs: 0, invoiceCount: 0, totalSalesAmount: 0 };
      }
      monthMap[monthKey].totalTcs += tcs;
      monthMap[monthKey].invoiceCount += 1;
      monthMap[monthKey].totalSalesAmount += salesAmt;

      const custKey = inv.customerId ? inv.customerId.toString() : (inv.customerName || 'Unknown Customer');
      if (!customerMap[custKey]) {
        customerMap[custKey] = {
          customerId: inv.customerId || null,
          customerName: inv.customerName || 'Unknown Customer',
          totalTcs: 0,
          invoiceCount: 0,
          totalSalesAmount: 0
        };
      }
      customerMap[custKey].totalTcs += tcs;
      customerMap[custKey].invoiceCount += 1;
      customerMap[custKey].totalSalesAmount += salesAmt;
    }

    const byMonth = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));
    const byCustomer = Object.values(customerMap).sort((a, b) => b.totalTcs - a.totalTcs);

    res.json({
      totalTcsCollected,
      totalInvoicesWithTcs: tcsInvoices.length,
      byMonth,
      byCustomer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
