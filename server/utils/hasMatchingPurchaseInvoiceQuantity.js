const QUANTITY_TOLERANCE = 0.0001;

function hasMatchingPurchaseInvoiceQuantity(billed, accepted) {
  const billedQuantity = Number(billed);
  const acceptedQuantity = Number(accepted);
  if (!Number.isFinite(billedQuantity) || !Number.isFinite(acceptedQuantity)) return false;
  return Math.abs(billedQuantity - acceptedQuantity) <= QUANTITY_TOLERANCE;
}

module.exports = hasMatchingPurchaseInvoiceQuantity;
