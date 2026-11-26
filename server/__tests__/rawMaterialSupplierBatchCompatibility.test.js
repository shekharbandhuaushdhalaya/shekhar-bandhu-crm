const assertSupplierBatchCompatibility = require('../utils/assertSupplierBatchCompatibility');

describe('raw material supplier batch attribution', () => {
  test('allows additional receipts for the same supplier lot', () => {
    expect(() => assertSupplierBatchCompatibility({ vendorId: 'supplier-1' }, 'supplier-1')).not.toThrow();
  });

  test('rejects merging an identical batch number from a different supplier', () => {
    expect(() => assertSupplierBatchCompatibility({ vendorId: 'supplier-1' }, 'supplier-2')).toThrow(expect.objectContaining({
      statusCode: 409,
      code: 'RAW_MATERIAL_SUPPLIER_BATCH_CONFLICT'
    }));
  });

  test('rejects an existing lot with missing supplier attribution rather than silently assigning one', () => {
    expect(() => assertSupplierBatchCompatibility({ vendorId: null }, 'supplier-2')).toThrow(expect.objectContaining({
      statusCode: 409,
      code: 'RAW_MATERIAL_SUPPLIER_BATCH_CONFLICT'
    }));
  });
});
