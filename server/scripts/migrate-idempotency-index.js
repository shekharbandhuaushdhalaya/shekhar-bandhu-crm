require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const IdempotencyKey = require('../models/IdempotencyKey');

const UNIQUE_INDEX_NAME = 'firmId_1_key_1_method_1_path_1_unique';
const UNIQUE_INDEX_KEYS = { firmId: 1, key: 1, method: 1, path: 1 };
const LEGACY_INDEX_KEYS = { key: 1, method: 1, path: 1, fingerprint: 1 };

async function migrateIdempotencyIndex(collection) {
  const indexes = await collection.indexes();
  const legacy = indexes.find(index => JSON.stringify(index.key) === JSON.stringify(LEGACY_INDEX_KEYS));

  // The old index allowed the same key/scope to be stored with different
  // fingerprints. Those rows collide under the new semantics. Never delete
  // or rewrite them automatically: stop and require an operator to reconcile.
  const duplicateScopes = await collection.aggregate([
    {
      $group: {
        _id: {
          firmId: { $ifNull: ['$firmId', null] },
          key: '$key',
          method: '$method',
          path: '$path'
        },
        count: { $sum: 1 },
        fingerprints: { $addToSet: '$fingerprint' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
    {
      $project: {
        _id: 1,
        count: 1,
        fingerprintCount: { $size: '$fingerprints' }
      }
    }
  ]).toArray();

  if (duplicateScopes.length) {
    const error = new Error(
      'Cannot create tenant-scoped idempotency index: duplicate (firmId, key, method, path) records exist. ' +
      'No records or indexes were changed. Reconcile the listed scopes manually, then rerun. ' +
      JSON.stringify(duplicateScopes)
    );
    error.code = 'IDEMPOTENCY_INDEX_DUPLICATES';
    throw error;
  }

  // Build the replacement first. Keep the legacy index until the new unique
  // constraint is confirmed, so a failed build never leaves the collection
  // without its existing uniqueness protection.
  await collection.createIndex(UNIQUE_INDEX_KEYS, {
    unique: true,
    name: UNIQUE_INDEX_NAME
  });

  if (legacy && legacy.name !== UNIQUE_INDEX_NAME) {
    await collection.dropIndex(legacy.name);
  }

  return { createdOrVerified: UNIQUE_INDEX_NAME, droppedLegacyIndex: legacy ? legacy.name : null };
}

async function main() {
  await mongoose.connect(config.mongoUri);
  const result = await migrateIdempotencyIndex(IdempotencyKey.collection);
  console.log('Idempotency index migration complete:', JSON.stringify(result));
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState) await mongoose.disconnect();
    });
}

module.exports = { migrateIdempotencyIndex, UNIQUE_INDEX_NAME, UNIQUE_INDEX_KEYS, LEGACY_INDEX_KEYS };
