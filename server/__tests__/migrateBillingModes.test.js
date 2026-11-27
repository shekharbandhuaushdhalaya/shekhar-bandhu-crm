const mongoose = require('mongoose');
const { validateMigrationConfig, BALANCE_RENAMES, MODE_RENAMES } = require('../scripts/migrate-billing-modes');

describe('billing mode migration configuration', () => {
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
    expect(validateMigrationConfig(valid)).toEqual({
      mongoUri: valid.MONGODB_URI,
      firmId: valid.MIGRATION_FIRM_ID,
      apply: false
    });
  });

  test('requires exact confirmation before applying changes', () => {
    expect(() => validateMigrationConfig({
      ...valid,
      MIGRATE_BILLING_MODES_APPLY: 'YES',
      MIGRATE_BILLING_MODES_CONFIRM: 'yes'
    })).toThrow('MIGRATE_BILLING_MODES_CONFIRM=YES');
  });

  test('allows apply only with both exact flags', () => {
    expect(validateMigrationConfig({
      ...valid,
      MIGRATE_BILLING_MODES_APPLY: 'YES',
      MIGRATE_BILLING_MODES_CONFIRM: 'YES'
    }).apply).toBe(true);
  });
});

describe('billing migration mappings', () => {
  test('scopes balance field renames to the intended party collections', () => {
    expect(BALANCE_RENAMES).toEqual(expect.arrayContaining([
      { collection: 'customers', from: 'kachhaBalance', to: 'cashBalance' },
      { collection: 'customers', from: 'pakkaBalance', to: 'regularBalance' },
      { collection: 'vendors', from: 'kachhaBalance', to: 'cashBalance' },
      { collection: 'vendors', from: 'pakkaBalance', to: 'regularBalance' }
    ]));
  });

  test('normalizes both legacy spellings and pakka values across billing collections', () => {
    for (const collection of ['stockmovements', 'invoices', 'payments', 'ledgerentries', 'quotations', 'challans']) {
      expect(MODE_RENAMES).toContainEqual(expect.objectContaining({
        collection, from: ['kaccha', 'kachha'], to: 'cash'
      }));
      expect(MODE_RENAMES).toContainEqual(expect.objectContaining({
        collection, from: ['pakka'], to: 'regular'
      }));
    }
  });
});
