const resolvePurchaseOrderItem = require('../utils/resolvePurchaseOrderItem');

describe('purchase-order line resolution for GRNs', () => {
  test('resolves a unique raw-material line', () => {
    const line = { rawMaterialId: 'raw-1', qtyOrdered: 10 };
    expect(resolvePurchaseOrderItem([line], { rawMaterialId: 'raw-1' })).toBe(line);
  });

  test('resolves a unique finished-product line', () => {
    const line = { productId: 'product-1', qtyOrdered: 10 };
    expect(resolvePurchaseOrderItem([line], { productId: 'product-1' })).toBe(line);
  });

  test('rejects a GRN item absent from the purchase order', () => {
    expect(() => resolvePurchaseOrderItem([], { rawMaterialId: 'raw-1' })).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'PO_ITEM_NOT_FOUND' })
    );
  });

  test('rejects legacy duplicate item identities instead of attributing receipt to the first line', () => {
    const duplicateLines = [
      { rawMaterialId: 'raw-1', qtyOrdered: 10, unitPrice: 100 },
      { rawMaterialId: 'raw-1', qtyOrdered: 5, unitPrice: 110 }
    ];
    expect(() => resolvePurchaseOrderItem(duplicateLines, { rawMaterialId: 'raw-1' })).toThrow(
      expect.objectContaining({ statusCode: 409, code: 'PO_ITEM_MATCH_AMBIGUOUS' })
    );
  });
});
