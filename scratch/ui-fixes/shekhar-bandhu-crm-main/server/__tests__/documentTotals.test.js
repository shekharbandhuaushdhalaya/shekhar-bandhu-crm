const { calculateItemTotals } = require('../utils/documentTotals');

describe('documentTotals Utility', () => {
  it('calculates intrastate (CGST + SGST) item totals correctly', () => {
    const items = [
      { qty: 10, packing: 2, rate: 100, discount: 10, gstRate: 18 }
    ];
    // pcs = 20, gross = 2000, discount = 200, taxable = 1800
    // CGST = 9% of 1800 = 162, SGST = 9% of 1800 = 162
    // total = 1800 + 162 + 162 = 2124
    const result = calculateItemTotals(items, false);

    expect(result.totalPcs).toBe(20);
    expect(result.baseAmount).toBe(1800);
    expect(result.cgst).toBe(162);
    expect(result.sgst).toBe(162);
    expect(result.igst).toBe(0);
    expect(result.grandTotal).toBe(2124);
  });

  it('calculates interstate (IGST) item totals correctly', () => {
    const items = [
      { qty: 5, packing: 1, rate: 500, discount: 0, gstRate: 12 }
    ];
    // pcs = 5, gross = 2500, discount = 0, taxable = 2500
    // IGST = 12% of 2500 = 300
    // total = 2800
    const result = calculateItemTotals(items, true);

    expect(result.totalPcs).toBe(5);
    expect(result.baseAmount).toBe(2500);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(300);
    expect(result.grandTotal).toBe(2800);
  });

  it('computes round-off correctly for decimal totals', () => {
    const items = [
      { qty: 1, packing: 1, rate: 100.33, discount: 0, gstRate: 18 }
    ];
    // taxable = 100.33, CGST = 9.0297, SGST = 9.0297
    // sum = 118.3894 -> rounded = 118
    const result = calculateItemTotals(items, false);

    expect(typeof result.grandTotal).toBe('number');
    expect(result.grandTotal).toBe(Math.round(100.33 * 1.18));
  });
});
