const express = require('express');
const SalesTarget = require('../../models/SalesTarget');
const MedicalRepresentative = require('../../models/MedicalRepresentative');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// Helper: calculate commission tier slab percentage
function calculateCommissionSlabPercent(achievementPercent) {
  if (achievementPercent >= 120) return 5.0; // 5% bonus above 120% target
  if (achievementPercent >= 100) return 3.0; // 3% bonus for 100% target completion
  if (achievementPercent >= 85) return 1.5;  // 1.5% bonus for 85%+ completion
  return 0;
}

// GET /api/mr-incentives/calculate — Calculate MR sales target vs actual achievement & incentive payouts
router.get('/calculate', authorize('mr:view'), async (req, res) => {
  try {
    const { month, year, mrId } = req.query;
    const targetMonth = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const mrFilter = {};
    if (mrId) mrFilter._id = mrId;

    const mrs = await MedicalRepresentative.find(mrFilter).lean();
    const results = [];

    for (const mr of mrs) {
      const targetDoc = await SalesTarget.findOne({
        mrId: mr._id,
        month: targetMonth,
        year: targetYear
      }).lean();

      const targetAmount = targetDoc ? (targetDoc.targetAmount || 0) : 100000; // default ₹1L target if unassigned

      // Find sales credited to this MR in given month/year
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

      const salesInvoices = await Invoice.find({
        type: 'sale',
        isFinalized: true,
        date: { $gte: startDate, $lte: endDate },
        $or: [{ mrId: mr._id }, { assignedMrId: mr._id }]
      }).lean();

      const actualAchievedAmount = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);
      const achievementPercent = targetAmount > 0 ? Number(((actualAchievedAmount / targetAmount) * 100).toFixed(1)) : 0;
      const slabCommissionPercent = calculateCommissionSlabPercent(achievementPercent);
      const incentivePayoutAmount = Number(((actualAchievedAmount * slabCommissionPercent) / 100).toFixed(2));

      results.push({
        mrId: mr._id,
        mrName: mr.name,
        mrCode: mr.code || 'N/A',
        headquarter: mr.headquarter || '',
        month: targetMonth,
        year: targetYear,
        targetAmount,
        actualAchievedAmount,
        achievementPercent,
        slabCommissionPercent,
        incentivePayoutAmount,
        totalSalesInvoicesCount: salesInvoices.length
      });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
