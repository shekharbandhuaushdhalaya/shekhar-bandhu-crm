const QUANTITY_TOLERANCE = 0.0001;

function hasBalancedGrnQuantities(received, accepted, rejected) {
  const values = [received, accepted, rejected].map(Number);
  if (values.some(value => !Number.isFinite(value))) return false;
  return Math.abs((values[1] + values[2]) - values[0]) <= QUANTITY_TOLERANCE;
}

module.exports = { hasBalancedGrnQuantities, QUANTITY_TOLERANCE };
