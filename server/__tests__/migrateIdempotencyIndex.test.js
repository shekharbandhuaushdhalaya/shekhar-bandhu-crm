const {
  validateMigrationConfig,
  sameIndexKeys,
  findUniqueIndex,
  findTtlIndex,
  duplicateScopesPipeline,
  migrateIdempotencyIndex,
  UNIQUE_INDEX_KEYS,
  LEGACY_INDEX_KEYS,
  COMPLETED_TTL_INDEX_KEYS
} = require('../scripts/migrate-idempotency-index');

const validEnv = { MONGODB_URI: 'mongodb://localhost:27017/test' };

function collectionMock(indexes, duplicateScopes = []) {
  return {
    indexes: jest.fn().mockResolvedValue(indexes),
    aggregate: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(duplicateScopes) })),
    createIndex: jest.fn().mockResolvedValue('created'),
    dropIndex: jest.fn().mockResolvedValue('dropped')
  };
}

describe('idempotency index migration configuration', () => {
  test('requires MONGODB_URI', () => {
    expect(() => validateMigrationConfig({})).toThrow('MONGODB_URI is required');
  });

  test('defaults to dry run', () => {
    expect(validateMigrationConfig(validEnv)).toEqual({
      mongoUri: validEnv.MONGODB_URI,
      apply: false
    });
  });

  test('requires both exact apply confirmations', () => {
    expect(() => validateMigrationConfig({
      ...validEnv,
      MIGRATE_IDEMPOTENCY_INDEX_APPLY: 'YES',
      MIGRATE_IDEMPOTENCY_INDEX_CONFIRM: 'yes'
    })).toThrow('MIGRATE_IDEMPOTENCY_INDEX_CONFIRM=YES');
    expect(validateMigrationConfig({
      ...validEnv,
      MIGRATE_IDEMPOTENCY_INDEX_APPLY: 'YES',
      MIGRATE_IDEMPOTENCY_INDEX_CONFIRM: 'YES'
    }).apply).toBe(true);
  });
});

describe('idempotency index migration helpers', () => {
  test('matches complete ordered key specifications only', () => {
    expect(sameIndexKeys({ key: 1 }, { key: 1 })).toBe(true);
    expect(sameIndexKeys({ key: 1, path: 1 }, { key: 1 })).toBe(false);
    expect(sameIndexKeys({ key: -1 }, { key: 1 })).toBe(false);
  });

  test('finds exact unique and TTL indexes', () => {
    const indexes = [
      { name: 'unique-scope', key: UNIQUE_INDEX_KEYS, unique: true },
      { name: 'completed-ttl', key: COMPLETED_TTL_INDEX_KEYS, expireAfterSeconds: 86400 }
    ];
    expect(findUniqueIndex(indexes, UNIQUE_INDEX_KEYS).name).toBe('unique-scope');
    expect(findTtlIndex(indexes, COMPLETED_TTL_INDEX_KEYS).name).toBe('completed-ttl');
  });

  test('duplicate preflight groups by tenant and idempotency scope', () => {
    const pipeline = duplicateScopesPipeline();
    expect(pipeline[0].$group._id).toEqual({
      firmId: { $ifNull: ['$firmId', null] },
      key: '$key',
      method: '$method',
      path: '$path'
    });
    expect(pipeline[1]).toEqual({ $match: { count: { $gt: 1 } } });
  });
});

describe('idempotency index migration safety', () => {
  test('dry run reports duplicate scopes and makes no index changes', async () => {
    const duplicates = [{ _id: { firmId: null, key: 'request-123', method: 'POST', path: '/api' }, count: 2 }];
    const collection = collectionMock([], duplicates);
    const logger = { log: jest.fn() };
    const result = await migrateIdempotencyIndex(collection, validEnv, logger);
    expect(result.duplicateScopes).toEqual(duplicates);
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  test('apply refuses duplicate scopes without changing indexes', async () => {
    const collection = collectionMock([], [{ count: 2 }]);
    const env = {
      ...validEnv,
      MIGRATE_IDEMPOTENCY_INDEX_APPLY: 'YES',
      MIGRATE_IDEMPOTENCY_INDEX_CONFIRM: 'YES'
    };
    await expect(migrateIdempotencyIndex(collection, env, { log: jest.fn() }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_INDEX_DUPLICATES' });
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  test('creates replacement indexes before dropping legacy indexes', async () => {
    const collection = collectionMock([
      { name: 'legacy_unique', key: LEGACY_INDEX_KEYS, unique: true },
      { name: 'createdAt_1_ttl', key: { createdAt: 1 }, expireAfterSeconds: 86400 }
    ]);
    const env = {
      ...validEnv,
      MIGRATE_IDEMPOTENCY_INDEX_APPLY: 'YES',
      MIGRATE_IDEMPOTENCY_INDEX_CONFIRM: 'YES'
    };
    await migrateIdempotencyIndex(collection, env, { log: jest.fn() });
    expect(collection.createIndex).toHaveBeenNthCalledWith(1, UNIQUE_INDEX_KEYS, expect.objectContaining({ unique: true }));
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, COMPLETED_TTL_INDEX_KEYS, expect.objectContaining({ expireAfterSeconds: 86400 }));
    expect(collection.dropIndex).toHaveBeenNthCalledWith(1, 'createdAt_1_ttl');
    expect(collection.dropIndex).toHaveBeenNthCalledWith(2, 'legacy_unique');
  });

  test('does not recreate indexes that are already correct', async () => {
    const collection = collectionMock([
      { name: 'firmId_1_key_1_method_1_path_1_unique', key: UNIQUE_INDEX_KEYS, unique: true },
      { name: 'completedAt_1_ttl', key: COMPLETED_TTL_INDEX_KEYS, expireAfterSeconds: 86400 }
    ]);
    const env = {
      ...validEnv,
      MIGRATE_IDEMPOTENCY_INDEX_APPLY: 'YES',
      MIGRATE_IDEMPOTENCY_INDEX_CONFIRM: 'YES'
    };
    await migrateIdempotencyIndex(collection, env, { log: jest.fn() });
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });
});
