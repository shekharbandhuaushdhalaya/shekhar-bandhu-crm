const LineClearance = require('../models/LineClearance');
const {
  validateMigrationConfig,
  sameIndexKeys,
  getTenantUniqueIndex,
  findLegacyUniqueIndex,
  duplicateGroupsPipeline
} = require('../scripts/migrate-line-clearance-phases');

describe('line-clearance phase index migration configuration', () => {
  const valid = { MONGODB_URI: 'mongodb://localhost:27017/test' };

  test('requires an explicit MongoDB URI', () => {
    expect(() => validateMigrationConfig({ MONGODB_URI: '' })).toThrow('MONGODB_URI is required');
  });

  test('defaults to dry-run mode', () => {
    expect(validateMigrationConfig(valid)).toEqual({ mongoUri: valid.MONGODB_URI, apply: false });
  });

  test('requires exact confirmation before applying index changes', () => {
    expect(() => validateMigrationConfig({
      ...valid,
      MIGRATE_LINE_CLEARANCE_PHASES_APPLY: 'YES',
      MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM: 'yes'
    })).toThrow('MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM=YES');
  });

  test('allows apply only with both exact flags', () => {
    expect(validateMigrationConfig({
      ...valid,
      MIGRATE_LINE_CLEARANCE_PHASES_APPLY: 'YES',
      MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM: 'YES'
    }).apply).toBe(true);
  });
});

describe('line-clearance tenant index definition', () => {
  test('model declares the tenant-scoped unique batch-and-phase index', () => {
    const [keys, options] = getTenantUniqueIndex(LineClearance.schema);
    expect(keys).toEqual({ firmId: 1, batchId: 1, phase: 1 });
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({ firmId: { $type: 'objectId' } });
  });

  test('matches index keys exactly, not by a name prefix', () => {
    expect(sameIndexKeys({ batchId: 1 }, { batchId: 1 })).toBe(true);
    expect(sameIndexKeys({ batchId: 1, unrelated: 1 }, { batchId: 1 })).toBe(false);
    expect(sameIndexKeys({ batchId: -1 }, { batchId: 1 })).toBe(false);
  });

  test('finds only an exact legacy unique batchId index', () => {
    const legacy = { name: 'batchId_1', key: { batchId: 1 }, unique: true };
    expect(findLegacyUniqueIndex([
      { name: 'batchId_1_phase_1', key: { batchId: 1, phase: 1 }, unique: true },
      { name: 'batchId_1_non_unique', key: { batchId: 1 }, unique: false },
      legacy
    ])).toEqual(legacy);
  });

  test('duplicate preflight groups by tenant, batch and phase', () => {
    const pipeline = duplicateGroupsPipeline();
    expect(pipeline[0]).toEqual({ $match: { firmId: { $type: 'objectId' } } });
    expect(pipeline[1].$group._id).toEqual({
      firmId: '$firmId', batchId: '$batchId', phase: '$phase'
    });
    expect(pipeline[2]).toEqual({ $match: { count: { $gt: 1 } } });
  });
});
