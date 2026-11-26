const mongoose = require('mongoose');
const { validateMigrationConfig, groupProducts } = require('../scripts/migrate-product-variants');

describe('product variant migration safeguards', () => {
  const valid = {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    MIGRATION_FIRM_ID: new mongoose.Types.ObjectId().toString()
  };

  test('requires an explicit database URI and tenant', () => {
    expect(() => validateMigrationConfig({ ...valid, MONGODB_URI: '' }))
      .toThrow('MONGODB_URI is required');
    expect(() => validateMigrationConfig({ ...valid, MIGRATION_FIRM_ID: '' }))
      .toThrow('valid MongoDB ObjectId');
  });

  test('defaults to dry-run without requiring write confirmation', () => {
    expect(validateMigrationConfig(valid)).toEqual({
      mongoUri: valid.MONGODB_URI,
      firmId: valid.MIGRATION_FIRM_ID,
      apply: false
    });
  });

  test('requires exact confirmation before applying changes', () => {
    expect(() => validateMigrationConfig({
      ...valid,
      MIGRATE_PRODUCT_VARIANTS_APPLY: 'YES',
      MIGRATE_PRODUCT_VARIANTS_CONFIRM: 'yes'
    })).toThrow('MIGRATE_PRODUCT_VARIANTS_CONFIRM=YES');
    expect(validateMigrationConfig({
      ...valid,
      MIGRATE_PRODUCT_VARIANTS_APPLY: 'YES',
      MIGRATE_PRODUCT_VARIANTS_CONFIRM: 'YES'
    }).apply).toBe(true);
  });

  test('groups normalized names without merging empty names', () => {
    const groups = groupProducts([
      { _id: '1', name: ' Herbal   Oil ' },
      { _id: '2', name: 'herbal oil' },
      { _id: '3', name: '   ' },
      { _id: '4', name: 'Soap' }
    ]);
    expect(groups.get('HERBAL OIL')).toHaveLength(2);
    expect(groups.has('SOAP')).toBe(true);
    expect(groups.size).toBe(2);
  });
});
