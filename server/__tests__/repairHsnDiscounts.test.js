const mongoose = require('mongoose');
const {
  validateMigrationConfig,
  getLinkedMovementId,
  planItemRepairs
} = require('../scripts/repair-hsn-discounts');

describe('HSN and discount repair configuration', () => {
  const valid = {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    MIGRATION_FIRM_ID: new mongoose.Types.ObjectId().toString()
  };

  test('requires an explicit database URI', () => {
    expect(() => validateMigrationConfig({ ...valid, MONGODB_URI: '' }))
      .toThrow('MONGODB_URI is required');
  });

  test('requires a valid explicit tenant ID', () => {
    expect(() => validateMigrationConfig({ ...valid, MIGRATION_FIRM_ID: '' }))
      .toThrow('valid MongoDB ObjectId');
  });

  test('defaults to dry-run mode', () => {
    expect(validateMigrationConfig(valid).apply).toBe(false);
  });

  test('requires exact confirmation before applying repairs', () => {
    expect(() => validateMigrationConfig({
      ...valid,
      REPAIR_HSN_DISCOUNTS_APPLY: 'YES',
      REPAIR_HSN_DISCOUNTS_CONFIRM: 'yes'
    })).toThrow('REPAIR_HSN_DISCOUNTS_CONFIRM=YES');
  });

  test('allows apply only with both exact flags', () => {
    expect(validateMigrationConfig({
      ...valid,
      REPAIR_HSN_DISCOUNTS_APPLY: 'YES',
      REPAIR_HSN_DISCOUNTS_CONFIRM: 'YES'
    }).apply).toBe(true);
  });
});

describe('HSN and discount repair planning', () => {
  test('only accepts an explicitly typed StockMovement reference', () => {
    const id = new mongoose.Types.ObjectId().toString();
    expect(getLinkedMovementId({ sourceDocType: 'StockMovement', sourceDocId: id })).toBe(id);
    expect(getLinkedMovementId({ sourceDocType: 'Challan', sourceDocId: id })).toBeNull();
    expect(getLinkedMovementId({ sourceDocType: '', sourceDocId: id })).toBeNull();
    expect(getLinkedMovementId({ sourceDocType: 'StockMovement', sourceDocId: 'invalid' })).toBeNull();
  });

  test('repairs only missing values from a unique linked movement item', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const result = planItemRepairs(
      { items: [{ productId, hsnCode: '', mrp: 0, discountPercent: 0, rate: 80 }] },
      { items: [{ productId, hsnCode: '30049011', mrp: 100, discountPercent: 20 }] }
    );

    expect(result.updates).toEqual({
      'items.0': { hsnCode: '30049011', mrp: 100, discountPercent: 20 }
    });
    expect(result.stats).toEqual({ hsn: 1, mrp: 1, discountPercent: 1, ambiguousItems: 0 });
  });

  test('does not overwrite existing values or infer from selling rate', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const result = planItemRepairs(
      { items: [{ productId, hsnCode: '30049010', mrp: 80, discountPercent: 0, rate: 80 }] },
      { items: [{ productId, hsnCode: '30049011', mrp: 100, discountPercent: 0 }] }
    );
    expect(result.updates).toEqual({});
  });

  test('skips ambiguous duplicate product lines in the source movement', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const result = planItemRepairs(
      { items: [{ productId, hsnCode: '', mrp: 0, discountPercent: 0 }] },
      { items: [
        { productId, hsnCode: '30049011', mrp: 100, discountPercent: 10 },
        { productId, hsnCode: '30049012', mrp: 120, discountPercent: 15 }
      ] }
    );
    expect(result.updates).toEqual({});
    expect(result.stats.ambiguousItems).toBe(1);
  });

  test('does not apply invalid source discount percentages', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const result = planItemRepairs(
      { items: [{ productId, discountPercent: 0 }] },
      { items: [{ productId, discountPercent: 120 }] }
    );
    expect(result.updates).toEqual({});
  });
});
