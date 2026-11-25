const { deriveReturnPricing } = require('../services/salesReturnService');

describe('Sales Return pricing and quantity safeguards', () => {
  const original = [{
    productId: 'product-1', name: 'Herbal Tablets', batchNo: 'B-01', packing: 1,
    vendorId: 'vendor-1', qty: 10, billableQty: 8, freeQty: 2, rate: 100, gstRate: 5
  }];

  test('allocates free units before paid units and derives value from original Challan', () => {
    const [returned] = deriveReturnPricing(original, [{
      productId: 'product-1', name: 'Herbal Tablets', batchNo: 'B-01', packing: 1,
      vendorId: 'vendor-1', qty: 3, rate: 1, gstRate: 0
    }]);
    expect(returned).toMatchObject({ qty: 3, freeQty: 2, billableQty: 1, rate: 100, gstRate: 5 });
  });

  test('prevents cumulative returns beyond the original dispatched quantity', () => {
    expect(() => deriveReturnPricing(original, [{
      productId: 'product-1', batchNo: 'B-01', packing: 1, vendorId: 'vendor-1', qty: 9
    }], [{ productId: 'product-1', batchNo: 'B-01', packing: 1, vendorId: 'vendor-1', qty: 2, billableQty: 0, freeQty: 2 }]))
      .toThrow('Return quantity exceeds remaining dispatched quantity');
  });

  test('rejects a batch/product combination not present on the source Challan', () => {
    expect(() => deriveReturnPricing(original, [{
      productId: 'product-2', batchNo: 'B-OTHER', packing: 1, vendorId: 'vendor-1', qty: 1
    }])).toThrow('was not dispatched on the original Challan');
  });
});
