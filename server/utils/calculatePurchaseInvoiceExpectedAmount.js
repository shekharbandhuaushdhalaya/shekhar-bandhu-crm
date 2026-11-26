function finiteAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function calculatePurchaseInvoiceExpectedAmount(lines = [], adjustments = {}) {
  const lineTotal = (Array.isArray(lines) ? lines : []).reduce((total, line) => (
    total + finiteAmount(line.expectedNet) + finiteAmount(line.expectedTax)
  ), 0);
  return lineTotal + finiteAmount(adjustments.freightAmount) +
    finiteAmount(adjustments.cartageAmount) + finiteAmount(adjustments.tcsAmount);
}

module.exports = calculatePurchaseInvoiceExpectedAmount;
