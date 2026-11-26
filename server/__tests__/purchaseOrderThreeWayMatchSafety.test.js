const findDuplicatePurchaseOrderItemKeys = require('../utils/findDuplicatePurchaseOrderItemKeys');
const calculatePurchaseInvoiceExpectedAmount = require('../utils/calculatePurchaseInvoiceExpectedAmount');
const hasMatchingPurchaseInvoiceQuantity = require('../utils/hasMatchingPurchaseInvoiceQuantity');

describe('3-way match PO line identity safety', () => {
  test('returns no duplicate keys for distinct raw materials and products', () => {
    expect(findDuplicatePurchaseOrderItemKeys([
      { rawMaterialId: 'raw-1' },
      { rawMaterialId: 'raw-2' },
      { productId: 'product-1' }
    ])).toEqual(new Set());
  });

  test('flags duplicate legacy PO item identities so 3-way match cannot reuse aggregate GRN quantity', () => {
    expect(findDuplicatePurchaseOrderItemKeys([
      { rawMaterialId: 'raw-1' },
      { rawMaterialId: 'raw-1' },
      { productId: 'product-1' }
    ])).toEqual(new Set(['raw:raw-1']));
  });

  test('keeps raw-material and product identifiers in separate namespaces', () => {
    expect(findDuplicatePurchaseOrderItemKeys([
      { rawMaterialId: 'same-id' },
      { productId: 'same-id' }
    ])).toEqual(new Set());
  });
});


describe('purchase invoice expected amount for 3-way matching', () => {
  test('reconciles a partial receipt invoice against accepted quantities, not the full PO value', () => {
    const lines = [
      { expectedNet: 250, expectedTax: 30 },
      { expectedNet: 100, expectedTax: 5 }
    ];
    expect(calculatePurchaseInvoiceExpectedAmount(lines)).toBe(385);
    expect(calculatePurchaseInvoiceExpectedAmount(lines)).not.toBe(770);
  });

  test('includes declared freight, cartage and TCS adjustments', () => {
    expect(calculatePurchaseInvoiceExpectedAmount(
      [{ expectedNet: 250, expectedTax: 30 }],
      { freightAmount: 10, cartageAmount: 5, tcsAmount: 2 }
    )).toBe(297);
  });

  test('treats missing or non-finite optional adjustments as zero', () => {
    expect(calculatePurchaseInvoiceExpectedAmount(
      [{ expectedNet: 100, expectedTax: 12 }],
      { freightAmount: undefined, cartageAmount: 'invalid', tcsAmount: null }
    )).toBe(112);
  });
});


describe('purchase invoice quantity reconciliation', () => {
  test('accepts a correctly billed partial receipt without requiring the full PO quantity', () => {
    const ordered = 100;
    const accepted = 25;
    const billed = 25;
    expect(accepted).toBeLessThan(ordered);
    expect(hasMatchingPurchaseInvoiceQuantity(billed, accepted)).toBe(true);
  });

  test('accepts PO lines that have not yet been received or billed', () => {
    expect(hasMatchingPurchaseInvoiceQuantity(0, 0)).toBe(true);
  });

  test('rejects invoices that overbill or underbill accepted quantities', () => {
    expect(hasMatchingPurchaseInvoiceQuantity(26, 25)).toBe(false);
    expect(hasMatchingPurchaseInvoiceQuantity(24, 25)).toBe(false);
  });

  test('uses a small decimal tolerance for floating-point quantity arithmetic', () => {
    expect(hasMatchingPurchaseInvoiceQuantity(0.1 + 0.2, 0.3)).toBe(true);
    expect(hasMatchingPurchaseInvoiceQuantity(0.3002, 0.3)).toBe(false);
  });

  test('rejects non-finite quantities', () => {
    expect(hasMatchingPurchaseInvoiceQuantity(Infinity, 1)).toBe(false);
  });
});
