const { hasBalancedGrnQuantities, QUANTITY_TOLERANCE } = require('../utils/grnQuantityBalance');

describe('GRN quantity reconciliation', () => {
  test('accepts decimal quantities affected by floating-point representation', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(hasBalancedGrnQuantities(0.3, 0.1, 0.2)).toBe(true);
  });

  test('accepts exact whole-number and decimal balances', () => {
    expect(hasBalancedGrnQuantities(10, 8, 2)).toBe(true);
    expect(hasBalancedGrnQuantities(1.25, 1, 0.25)).toBe(true);
  });

  test('rejects quantity differences outside the documented tolerance', () => {
    expect(hasBalancedGrnQuantities(10, 8, 1.9)).toBe(false);
    expect(hasBalancedGrnQuantities(10, 8, 2 + QUANTITY_TOLERANCE * 2)).toBe(false);
  });

  test('rejects non-finite quantities', () => {
    expect(hasBalancedGrnQuantities(10, 8, NaN)).toBe(false);
    expect(hasBalancedGrnQuantities(10, Infinity, 0)).toBe(false);
  });
});
