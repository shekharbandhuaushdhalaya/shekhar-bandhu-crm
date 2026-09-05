const Invoice = require('../models/Invoice');

const TCS_THRESHOLD_AMOUNT = 5000000; // ₹50 Lakhs
const TCS_STANDARD_RATE = 0.001; // 0.1%

/**
 * Returns financial year boundaries (April 1 to March 31) for a given date
 */
function getFinancialYearBounds(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 3 = Apr
  const fyStartYear = month >= 3 ? year : year - 1;
  const fyStart = new Date(fyStartYear, 3, 1, 0, 0, 0, 0); // April 1
  const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999); // March 31
  return { fyStart, fyEnd };
}

/**
 * Calculates Section 206C(1H) TCS for B2B sales exceeding ₹50 Lakhs in a financial year.
 */
async function calculateTCS({ customerId, invoiceAmount = 0, financialYearCumulativeSales, invoiceDate = new Date() }) {
  let cumulative = 0;

  if (typeof financialYearCumulativeSales === 'number') {
    cumulative = financialYearCumulativeSales;
  } else if (customerId) {
    const { fyStart } = getFinancialYearBounds(invoiceDate);
    const priorInvoices = await Invoice.find({
      $or: [{ customerId }, { customerName: customerId }],
      type: 'sale',
      isFinalized: true,
      date: { $gte: fyStart, $lt: invoiceDate }
    }).lean();

    cumulative = priorInvoices.reduce((sum, inv) => sum + (inv.amount || inv.nettTotal || 0), 0);
  }

  const prospectiveTotal = cumulative + invoiceAmount;

  if (prospectiveTotal <= TCS_THRESHOLD_AMOUNT) {
    return {
      applicable: false,
      amount: 0,
      cumulativeSales: cumulative,
      taxablePortion: 0
    };
  }

  const amountAboveThreshold = prospectiveTotal - TCS_THRESHOLD_AMOUNT;
  const taxablePortion = Math.min(invoiceAmount, amountAboveThreshold);
  const tcsAmount = Math.round(taxablePortion * TCS_STANDARD_RATE * 100) / 100;

  return {
    applicable: true,
    amount: tcsAmount,
    cumulativeSales: cumulative,
    taxablePortion
  };
}

module.exports = {
  calculateTCS,
  getFinancialYearBounds,
  TCS_THRESHOLD_AMOUNT,
  TCS_STANDARD_RATE
};
