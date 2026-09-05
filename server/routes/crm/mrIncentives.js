const express = require('express');
const SalesTarget = require('../../models/SalesTarget');
const MedicalRepresentative = require('../../models/MedicalRepresentative');
const Invoice = require('../../models/Invoice');
const MrVisit = require('../../models/MrVisit');
const Contact = require('../../models/Contact');
const Customer = require('../../models/Customer');
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

// GET /api/mr-incentives/:mrId/scorecard — Real-time MR Performance Scorecard & Metrics
router.get('/:mrId/scorecard', authorize('mr:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const mr = await MedicalRepresentative.findById(req.params.mrId).lean();
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const [assignedContacts, assignedCustomers, visits, salesInvoices] = await Promise.all([
      Contact.find({ assignedMrId: req.params.mrId }).lean(),
      Customer.find({ assignedMrId: req.params.mrId }).lean(),
      MrVisit.find({ mrId: req.params.mrId, date: { $gte: startDate, $lte: endDate } }).lean(),
      Invoice.find({
        type: 'sale',
        isFinalized: true,
        date: { $gte: startDate, $lte: endDate },
        $or: [{ mrId: req.params.mrId }, { assignedMrId: req.params.mrId }]
      }).lean()
    ]);

    const totalAssignedDoctors = assignedContacts.length + assignedCustomers.length;
    const uniqueVisitedDoctorIds = new Set(visits.map(v => (v.doctorId || v.contactId || v.customerId || '').toString()));
    const doctorCoveragePercent = totalAssignedDoctors > 0
      ? Number(((uniqueVisitedDoctorIds.size / totalAssignedDoctors) * 100).toFixed(1))
      : 100;

    const sampleVisitsCount = visits.filter(v => (v.samplesGiven || []).length > 0).length;
    const sampleConversionPercent = visits.length > 0
      ? Number(((sampleVisitsCount / visits.length) * 100).toFixed(1))
      : 0;

    const actualAchievedSales = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);
    const targetDoc = await SalesTarget.findOne({ mrId: req.params.mrId, month: targetMonth, year: targetYear }).lean();
    const targetAmount = targetDoc ? targetDoc.targetAmount : 100000;
    const achievementPercent = targetAmount > 0 ? Number(((actualAchievedSales / targetAmount) * 100).toFixed(1)) : 0;
    const commissionPercent = calculateCommissionSlabPercent(achievementPercent);
    const estimatedPayout = Number(((actualAchievedSales * commissionPercent) / 100).toFixed(2));

    res.json({
      mrId: mr._id,
      mrName: mr.name,
      month: targetMonth,
      year: targetYear,
      totalAssignedDoctors,
      uniqueVisitedDoctors: uniqueVisitedDoctorIds.size,
      doctorCoveragePercent,
      totalVisitsCount: visits.length,
      sampleVisitsCount,
      sampleConversionPercent,
      targetAmount,
      actualAchievedSales,
      achievementPercent,
      commissionPercent,
      estimatedPayout
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mr-incentives/leaderboard — MR Performance Leaderboard Ranking
router.get('/leaderboard', authorize('mr:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

    const mrs = await MedicalRepresentative.find({}).lean();
    const leaderboard = [];

    for (const mr of mrs) {
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

      const [assignedContacts, visits, salesInvoices] = await Promise.all([
        Contact.find({ assignedMrId: mr._id }).lean(),
        MrVisit.find({ mrId: mr._id, date: { $gte: startDate, $lte: endDate } }).lean(),
        Invoice.find({ type: 'sale', isFinalized: true, date: { $gte: startDate, $lte: endDate }, $or: [{ mrId: mr._id }, { assignedMrId: mr._id }] }).lean()
      ]);

      const sales = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);
      const totalAssigned = Math.max(1, assignedContacts.length);
      const coverage = Math.min(100, Number(((visits.length / totalAssigned) * 100).toFixed(1)));
      const compositeScore = Number((sales * 0.7 + coverage * 100 + visits.length * 50).toFixed(0));

      leaderboard.push({
        mrId: mr._id,
        mrName: mr.name,
        headquarter: mr.headquarter || 'HO',
        totalSales: sales,
        doctorVisitsCount: visits.length,
        coveragePercent: coverage,
        compositeScore
      });
    }

    leaderboard.sort((a, b) => b.compositeScore - a.compositeScore);
    const rankedLeaderboard = leaderboard.map((item, idx) => ({
      rank: idx + 1,
      badge: idx === 0 ? '🥇 Gold MR' : idx === 1 ? '🥈 Silver MR' : idx === 2 ? '🥉 Bronze MR' : ' Star Achiever',
      ...item
    }));

    res.json(rankedLeaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
