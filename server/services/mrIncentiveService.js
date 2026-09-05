const mongoose = require('mongoose');
const SalesTarget = require('../models/SalesTarget');
const Invoice = require('../models/Invoice');

function calculateCommissionSlabPercent(achievementPercent) {
  if (achievementPercent >= 120) return 5.0;
  if (achievementPercent >= 100) return 3.0;
  if (achievementPercent >= 85) return 1.5;
  return 0;
}

async function calculateMrIncentive(mrId, year, month) {
  const targetMonth = parseInt(month, 10);
  const targetYear = parseInt(year, 10);

  const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const rawMrIdStr = mrId ? mrId.toString() : '';
  const mrObjId = mongoose.Types.ObjectId.isValid(rawMrIdStr) ? new mongoose.Types.ObjectId(rawMrIdStr) : rawMrIdStr;

  const [targetDoc, salesInvoices] = await Promise.all([
    SalesTarget.findOne({
      $or: [{ mrId: mrObjId }, { mrId: rawMrIdStr }, { agentId: mrObjId }, { agentId: rawMrIdStr }],
      month: targetMonth,
      year: targetYear
    }).lean(),
    Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: startDate, $lte: endDate },
      $or: [
        { mrId: mrObjId },
        { mrId: rawMrIdStr },
        { assignedMrId: mrObjId },
        { assignedMrId: rawMrIdStr }
      ]
    }).lean()
  ]);

  // console.log('DEBUG:', { mrId: rawMrIdStr, startDate, endDate, salesInvoicesCount: salesInvoices.length });

  const targetAmount = targetDoc ? (targetDoc.targetAmount || 0) : 100000;
  const actualAchievedAmount = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);
  const achievementPercent = targetAmount > 0 ? Number(((actualAchievedAmount / targetAmount) * 100).toFixed(1)) : 0;
  const slabCommissionPercent = calculateCommissionSlabPercent(achievementPercent);
  const incentivePayoutAmount = Number(((actualAchievedAmount * slabCommissionPercent) / 100).toFixed(2));

  return {
    targetAmount,
    actualAchievedAmount,
    achievementPercent,
    slabCommissionPercent,
    incentivePayoutAmount
  };
}

module.exports = {
  calculateCommissionSlabPercent,
  calculateMrIncentive
};
