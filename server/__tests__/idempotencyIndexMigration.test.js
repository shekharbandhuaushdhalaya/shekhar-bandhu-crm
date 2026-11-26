const { migrateIdempotencyIndex, UNIQUE_INDEX_NAME, LEGACY_INDEX_KEYS } = require('../scripts/migrate-idempotency-index');

function collectionWith({ duplicates = [], indexes = [] } = {}) {
  const calls = [];
  return {
    calls,
    indexes: jest.fn().mockResolvedValue(indexes),
    aggregate: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(duplicates) })),
    createIndex: jest.fn(async (...args) => { calls.push(['createIndex', ...args]); return UNIQUE_INDEX_NAME; }),
    dropIndex: jest.fn(async (...args) => { calls.push(['dropIndex', ...args]); })
  };
}

describe('idempotency index migration safety', () => {
  test('aborts on duplicate tenant/key scopes without changing indexes or records', async () => {
    const collection = collectionWith({
      duplicates: [{ _id: { firmId: null, key: 'same-key', method: 'POST', path: '/payments' }, count: 2, fingerprintCount: 2 }],
      indexes: [{ name: 'legacy_idempotency', key: LEGACY_INDEX_KEYS }]
    });

    await expect(migrateIdempotencyIndex(collection)).rejects.toMatchObject({ code: 'IDEMPOTENCY_INDEX_DUPLICATES' });
    expect(collection.createIndex).not.toHaveBeenCalled();
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  test('creates the tenant-scoped unique index before dropping the legacy index', async () => {
    const collection = collectionWith({
      indexes: [{ name: 'legacy_idempotency', key: LEGACY_INDEX_KEYS }]
    });

    await expect(migrateIdempotencyIndex(collection)).resolves.toEqual({
      createdOrVerified: UNIQUE_INDEX_NAME,
      droppedLegacyIndex: 'legacy_idempotency'
    });
    expect(collection.calls.map(call => call[0])).toEqual(['createIndex', 'dropIndex']);
  });

  test('retains the legacy index when creating the replacement fails', async () => {
    const collection = collectionWith({
      indexes: [{ name: 'legacy_idempotency', key: LEGACY_INDEX_KEYS }]
    });
    collection.createIndex.mockRejectedValueOnce(new Error('index build failed'));

    await expect(migrateIdempotencyIndex(collection)).rejects.toThrow('index build failed');
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  test('is safe to rerun when no legacy index remains', async () => {
    const collection = collectionWith();
    await expect(migrateIdempotencyIndex(collection)).resolves.toEqual({
      createdOrVerified: UNIQUE_INDEX_NAME,
      droppedLegacyIndex: null
    });
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });
});
