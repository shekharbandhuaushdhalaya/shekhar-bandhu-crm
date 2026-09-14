const MedicalRepresentative = require('../models/MedicalRepresentative');
const MrDailyLog = require('../models/MrDailyLog');
const MrVisit = require('../models/MrVisit');
const MrExpense = require('../models/MrExpense');
const MrSampleBag = require('../models/MrSampleBag');
const MrTourPlan = require('../models/MrTourPlan');

/**
 * Calculates Haversine GPS straight-line distance in meters between two lat/lng coordinates.
 */
function getHaversineDistanceInMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Compiles a single-day Daily Call Report (DCR) for an MR.
 */
async function compileMRDailyCallReport(mrId, targetDate) {
  const dateObj = targetDate ? new Date(targetDate) : new Date();
  const startOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0);
  const endOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);

  const mr = await MedicalRepresentative.findById(mrId).lean();
  if (!mr) return null;

  const [dailyLog, visits, expenses, sampleBag] = await Promise.all([
    MrDailyLog.findOne({ mrId, date: { $gte: startOfDay, $lte: endOfDay } }).lean(),
    MrVisit.find({ mrId, date: { $gte: startOfDay, $lte: endOfDay } }).populate('sampleDetails.productId', 'name').lean(),
    MrExpense.find({ mrId, date: { $gte: startOfDay, $lte: endOfDay } }).lean(),
    MrSampleBag.find({ mrId }).populate('productId', 'name').lean()
  ]);

  const totalVisits = visits.length;
  const geofencedVisits = visits.filter(v => v.doctorVerified).length;
  const ordersTaken = visits.filter(v => v.orderTaken).length;
  const totalOrderValue = visits.reduce((sum, v) => sum + (v.orderAmount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return {
    mr: { id: mr._id, name: mr.name, code: mr.code, territory: mr.territory },
    date: startOfDay,
    attendance: dailyLog ? {
      status: dailyLog.status,
      checkInTime: dailyLog.checkIn?.time || null,
      checkOutTime: dailyLog.checkOut?.time || null,
      startKm: dailyLog.startKmReading || 0,
      endKm: dailyLog.endKmReading || 0,
      totalDistance: dailyLog.totalDistance || 0
    } : null,
    summary: {
      totalVisits,
      geofencedVisits,
      geofenceRatePct: totalVisits > 0 ? Number(((geofencedVisits / totalVisits) * 100).toFixed(1)) : 0,
      ordersTaken,
      totalOrderValue,
      totalExpenses
    },
    visits,
    expenses,
    sampleBagBalance: sampleBag
  };
}

/**
 * Calculates monthly MR performance leaderboard and weighted scores.
 */
async function calculateMRLeaderboard(month, year) {
  const now = new Date();
  const qMonth = month || (now.getMonth() + 1).toString().padStart(2, '0');
  const qYear = parseInt(year, 10) || now.getFullYear();

  const startOfMonth = new Date(qYear, parseInt(qMonth, 10) - 1, 1);
  const endOfMonth = new Date(qYear, parseInt(qMonth, 10), 0, 23, 59, 59, 999);

  const mrs = await MedicalRepresentative.find({ isActive: true }).lean();
  const mrIds = mrs.map(m => m._id);

  const [visits, attendance] = await Promise.all([
    MrVisit.find({ mrId: { $in: mrIds }, date: { $gte: startOfMonth, $lte: endOfMonth } }).lean(),
    MrDailyLog.find({ mrId: { $in: mrIds }, date: { $gte: startOfMonth, $lte: endOfMonth } }).lean()
  ]);

  const statsMap = {};
  mrs.forEach(m => {
    statsMap[m._id.toString()] = {
      mrId: m._id,
      name: m.name,
      code: m.code,
      territory: m.territory,
      monthlyTarget: m.monthlyTarget || 100000,
      daysWorked: 0,
      totalVisits: 0,
      geofencedVisits: 0,
      ordersTaken: 0,
      totalOrderValue: 0
    };
  });

  attendance.forEach(a => {
    const key = a.mrId ? a.mrId.toString() : null;
    if (key && statsMap[key]) {
      statsMap[key].daysWorked++;
    }
  });

  visits.forEach(v => {
    const key = v.mrId ? v.mrId.toString() : null;
    if (key && statsMap[key]) {
      statsMap[key].totalVisits++;
      if (v.doctorVerified) statsMap[key].geofencedVisits++;
      if (v.orderTaken) {
        statsMap[key].ordersTaken++;
        statsMap[key].totalOrderValue += (v.orderAmount || 0);
      }
    }
  });

  const leaderboard = Object.values(statsMap).map(s => {
    const callAverage = s.daysWorked > 0 ? Number((s.totalVisits / s.daysWorked).toFixed(1)) : 0;
    const geofenceCompliancePct = s.totalVisits > 0 ? Number(((s.geofencedVisits / s.totalVisits) * 100).toFixed(1)) : 0;
    const strikeRatePct = s.totalVisits > 0 ? Number(((s.ordersTaken / s.totalVisits) * 100).toFixed(1)) : 0;
    const targetAchievementPct = s.monthlyTarget > 0 ? Number(((s.totalOrderValue / s.monthlyTarget) * 100).toFixed(1)) : 0;

    const performanceScore = Number((
      (targetAchievementPct * 0.4) +
      (geofenceCompliancePct * 0.3) +
      (strikeRatePct * 0.2) +
      (Math.min(callAverage / 10, 1) * 100 * 0.1)
    ).toFixed(1));

    return {
      ...s,
      callAverage,
      geofenceCompliancePct,
      strikeRatePct,
      targetAchievementPct,
      performanceScore
    };
  });

  leaderboard.sort((a, b) => b.performanceScore - a.performanceScore);

  return {
    month: qMonth,
    year: qYear,
    leaderboard
  };
}

/**
 * Calculates Planned vs Actual Beat/Tour Plan compliance for an MR.
 */
async function calculateTourPlanCompliance(mrId, month, year) {
  const now = new Date();
  const qMonth = month || (now.getMonth() + 1).toString().padStart(2, '0');
  const qYear = parseInt(year, 10) || now.getFullYear();

  const startOfMonth = new Date(qYear, parseInt(qMonth, 10) - 1, 1);
  const endOfMonth = new Date(qYear, parseInt(qMonth, 10), 0, 23, 59, 59, 999);

  const [tourPlan, visits] = await Promise.all([
    MrTourPlan.findOne({ mrId, month: qMonth, year: qYear }).lean(),
    MrVisit.find({ mrId, date: { $gte: startOfMonth, $lte: endOfMonth } }).lean()
  ]);

  if (!tourPlan || !tourPlan.entries || tourPlan.entries.length === 0) {
    return {
      mrId,
      month: qMonth,
      year: qYear,
      status: 'no_plan',
      totalPlannedDoctors: 0,
      visitedPlannedDoctors: 0,
      compliancePct: 0,
      entries: []
    };
  }

  let totalPlanned = 0;
  let totalVisitedPlanned = 0;

  const entryReports = tourPlan.entries.map(e => {
    const entryDate = new Date(e.date);
    const startOfEntryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 0, 0, 0);
    const endOfEntryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 23, 59, 59, 999);

    const dayVisits = visits.filter(v => new Date(v.date) >= startOfEntryDay && new Date(v.date) <= endOfEntryDay);
    const visitedDoctorNames = dayVisits.map(v => v.doctorName.toLowerCase());

    const plannedDoctors = e.targetDoctorNames || [];
    totalPlanned += plannedDoctors.length;

    const matchedDoctors = plannedDoctors.filter(doc => visitedDoctorNames.includes(doc.toLowerCase()));
    totalVisitedPlanned += matchedDoctors.length;

    const compliancePct = plannedDoctors.length > 0 ? Number(((matchedDoctors.length / plannedDoctors.length) * 100).toFixed(1)) : 100;

    return {
      date: e.date,
      territory: e.territory,
      plannedDoctorNames: plannedDoctors,
      actualVisitedDoctorNames: dayVisits.map(v => v.doctorName),
      matchedDoctors,
      compliancePct
    };
  });

  const overallCompliancePct = totalPlanned > 0 ? Number(((totalVisitedPlanned / totalPlanned) * 100).toFixed(1)) : 100;

  return {
    mrId,
    month: qMonth,
    year: qYear,
    status: tourPlan.status,
    totalPlannedDoctors: totalPlanned,
    visitedPlannedDoctors: totalVisitedPlanned,
    compliancePct: overallCompliancePct,
    entries: entryReports
  };
}

/**
 * Calculates MR-wise Profitability & ROI:
 * Sales Generated - (Commission + Approved Expenses + Sample Costs)
 */
async function calculateMRProfitability(mrId, month, year) {
  const now = new Date();
  const qMonth = month || (now.getMonth() + 1).toString().padStart(2, '0');
  const qYear = parseInt(year, 10) || now.getFullYear();

  const startOfMonth = new Date(qYear, parseInt(qMonth, 10) - 1, 1);
  const endOfMonth = new Date(qYear, parseInt(qMonth, 10), 0, 23, 59, 59, 999);

  const filter = { date: { $gte: startOfMonth, $lte: endOfMonth } };
  if (mrId) filter.mrId = mrId;

  const [visits, expenses, sampleBags] = await Promise.all([
    MrVisit.find(filter).lean(),
    MrExpense.find({ ...filter, status: 'approved' }).lean(),
    MrSampleBag.find(mrId ? { mrId } : {}).populate('productId', 'price mrp').lean()
  ]);

  const mr = mrId ? await MedicalRepresentative.findById(mrId).lean() : null;

  const grossSales = visits.reduce((sum, v) => sum + (v.orderAmount || 0), 0);
  const totalApprovedExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  let totalSampleCost = 0;
  visits.forEach(v => {
    if (v.sampleDetails && v.sampleDetails.length > 0) {
      v.sampleDetails.forEach(s => {
        const bagItem = sampleBags.find(sb => sb.productId && sb.productId._id.toString() === s.productId?.toString());
        const unitCost = bagItem && bagItem.productId ? (bagItem.productId.price || 0) : 50;
        totalSampleCost += (s.qty || 1) * unitCost;
      });
    }
  });

  const commissionRate = mr ? (mr.commissionRate || 5) : 5;
  const estimatedCommission = Number(((grossSales * commissionRate) / 100).toFixed(2));

  const totalInvestmentCost = Number((estimatedCommission + totalApprovedExpenses + totalSampleCost).toFixed(2));
  const netProfit = Number((grossSales - totalInvestmentCost).toFixed(2));
  const roiPct = totalInvestmentCost > 0 ? Number(((netProfit / totalInvestmentCost) * 100).toFixed(1)) : 0;

  return {
    mrId,
    mrName: mr ? mr.name : 'All MRs',
    month: qMonth,
    year: qYear,
    grossSales,
    estimatedCommission,
    totalApprovedExpenses,
    totalSampleCost,
    totalInvestmentCost,
    netProfit,
    roiPct
  };
}

module.exports = {
  getHaversineDistanceInMeters,
  compileMRDailyCallReport,
  calculateMRLeaderboard,
  calculateTourPlanCompliance,
  calculateMRProfitability
};
