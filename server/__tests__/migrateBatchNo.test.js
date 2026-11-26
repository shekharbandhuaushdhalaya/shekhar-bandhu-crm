const mongoose = require('mongoose');
const { validateMigrationConfig } = require('../scripts/migrateBatchNo');

describe('batch data migration configuration', () => {
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

  test('requires exact confirmation before applying repairs', () => {
    expect(() => validateMigrationConfig({
      ...valid,
      MIGRATE_BATCH_DATA_APPLY: 'YES',
      MIGRATE_BATCH_DATA_CONFIRM: 'yes'
    })).toThrow('MIGRATE_BATCH_DATA_CONFIRM=YES');
  });

  test('allows apply only with both exact flags', () => {
    expect(validateMigrationConfig({
      ...valid,
      MIGRATE_BATCH_DATA_APPLY: 'YES',
      MIGRATE_BATCH_DATA_CONFIRM: 'YES'
    }).apply).toBe(true);
  });
});
