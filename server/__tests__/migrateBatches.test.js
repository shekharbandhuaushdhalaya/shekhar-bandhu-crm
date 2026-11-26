const mongoose = require('mongoose');
const { validateMigrationConfig } = require('../scripts/migrate-batches');

describe('batch migration configuration', () => {
  const valid = {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    MIGRATE_BATCHES_CONFIRM: 'YES',
    MIGRATION_FIRM_ID: new mongoose.Types.ObjectId().toString()
  };

  test('requires an explicit database URI', () => {
    expect(() => validateMigrationConfig({ ...valid, MONGODB_URI: '' }))
      .toThrow('MONGODB_URI is required');
  });

  test('requires exact operator confirmation', () => {
    expect(() => validateMigrationConfig({ ...valid, MIGRATE_BATCHES_CONFIRM: 'yes' }))
      .toThrow('MIGRATE_BATCHES_CONFIRM=YES');
  });

  test('requires a valid explicit tenant ID', () => {
    expect(() => validateMigrationConfig({ ...valid, MIGRATION_FIRM_ID: '' }))
      .toThrow('valid MongoDB ObjectId');
  });

  test('returns validated connection and tenant configuration', () => {
    expect(validateMigrationConfig(valid)).toEqual({
      mongoUri: valid.MONGODB_URI,
      firmId: valid.MIGRATION_FIRM_ID
    });
  });
});
