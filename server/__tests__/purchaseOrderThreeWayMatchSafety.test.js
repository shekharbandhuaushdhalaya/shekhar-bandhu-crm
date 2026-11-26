const findDuplicatePurchaseOrderItemKeys = require('../utils/findDuplicatePurchaseOrderItemKeys');

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
