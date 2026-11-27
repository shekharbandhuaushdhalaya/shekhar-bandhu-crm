require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const UNIQUE_INDEX_NAME = 'firmId_1_key_1_method_1_path_1_unique';
const UNIQUE_INDEX_KEYS = { firmId: 1, key: 1, method: 1, path: 1 };
const LEGACY_INDEX_KEYS = { key: 1, method: 1, path: 1, fingerprint: 1 };
const COMPLETED_TTL_INDEX_NAME = 'completedAt_1_ttl';
const COMPLETED_TTL_INDEX_KEYS = { completedAt: 1 };
const LEGACY_CREATED_TTL_KEYS = { createdAt: 1 };

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const apply = env.MIGRATE_IDEMPOTENCY_INDEX_APPLY === 'YES';
  if (apply && env.MIGRATE_IDEMPOTENCY_INDEX_CONFIRM !== 'YES') {
    throw new Error('Applying idempotency index migration requires MIGRATE_IDEMPOTENCY_INDEX_CONFIRM=YES.');
  }
  return { mongoUri, apply };
}

function sameIndexKeys(actual, expected) {
  const actualEntries = Object.entries(actual || {});
  const expectedEntries = Object.entries(expected || {});
  return actualEntries.length === expectedEntries.length &&
    actualEntries.every(([key, value], index) =>
      key === expectedEntries[index][0] && value === expectedEntries[index][1]);
}

function findUniqueIndex(indexes, keys) {
  return indexes.find(index => index.unique === true && sameIndexKeys(index.key, keys)) || null;
}

function findTtlIndex(indexes, keys) {
  return indexes.find(index => index.expireAfterSeconds != null && sameIndexKeys(index.key, keys)) || null;
}

function duplicateScopesPipeline() {
  return [
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
  ];
}

async function migrateIdempotencyIndex(collection, env = process.env, logger = console) {
  const { apply } = validateMigrationConfig(env);
  const indexes = await collection.indexes();
  const legacy = findUniqueIndex(indexes, LEGACY_INDEX_KEYS);
  const oldTtl = findTtlIndex(indexes, LEGACY_CREATED_TTL_KEYS);
  const target = findUniqueIndex(indexes, UNIQUE_INDEX_KEYS);
  const completedTtl = findTtlIndex(indexes, COMPLETED_TTL_INDEX_KEYS);
  const targetNameConflict = indexes.find(index =>
    index.name === UNIQUE_INDEX_NAME && !sameIndexKeys(index.key, UNIQUE_INDEX_KEYS));
  const ttlNameConflict = indexes.find(index =>
    index.name === COMPLETED_TTL_INDEX_NAME &&
    (!sameIndexKeys(index.key, COMPLETED_TTL_INDEX_KEYS) || index.expireAfterSeconds !== 86400));

  if (targetNameConflict) throw new Error('The target unique index name already exists with a different key specification.');
  if (ttlNameConflict) throw new Error('The completedAt TTL index name already exists with a different specification.');
  if (target && target.name !== UNIQUE_INDEX_NAME) {
    throw new Error(`A unique target index already exists under unexpected name "${target.name}"; review it manually.`);
  }
  if (completedTtl && (completedTtl.name !== COMPLETED_TTL_INDEX_NAME || completedTtl.expireAfterSeconds !== 86400)) {
    throw new Error(`A completedAt TTL index already exists with unexpected settings (" ${completedTtl.name} ").`);
  }

  const duplicateScopes = await collection.aggregate(duplicateScopesPipeline()).toArray();
  const summary = {
    apply,
    duplicateScopes,
    existingTargetIndex: target ? target.name : null,
    legacyUniqueIndex: legacy ? legacy.name : null,
    existingCompletedTtlIndex: completedTtl ? completedTtl.name : null,
    legacyCreatedAtTtlIndex: oldTtl ? oldTtl.name : null
  };

  if (!apply) {
    logger.log('Idempotency index migration dry run:', JSON.stringify({
      ...summary,
      nextSteps: [
        'Review duplicate scopes and reconcile them manually before applying.',
        'Confirm the completedAt TTL behavior is correct for this deployment.',
        'To apply, set MIGRATE_IDEMPOTENCY_INDEX_APPLY=YES and MIGRATE_IDEMPOTENCY_INDEX_CONFIRM=YES.'
      ]
    }, null, 2));
    logger.log('No database indexes or records changed.');
    return summary;
  }

  if (duplicateScopes.length) {
    const error = new Error(
      'Cannot create tenant-scoped idempotency index: duplicate (firmId, key, method, path) records exist. ' +
      'No records or indexes were changed. Reconcile the listed scopes manually, then rerun.'
    );
    error.code = 'IDEMPOTENCY_INDEX_DUPLICATES';
    error.duplicateScopes = duplicateScopes;
    throw error;
  }

  // Create replacement constraints before dropping any legacy constraints.
  if (!target) {
    await collection.createIndex(UNIQUE_INDEX_KEYS, {
      unique: true,
      name: UNIQUE_INDEX_NAME
    });
  }
  if (!completedTtl) {
    await collection.createIndex(COMPLETED_TTL_INDEX_KEYS, {
      expireAfterSeconds: 86400,
      name: COMPLETED_TTL_INDEX_NAME
    });
  }

  // Processing records have no completedAt and therefore remain outside this TTL.
  if (oldTtl && oldTtl.name !== COMPLETED_TTL_INDEX_NAME) {
    await collection.dropIndex(oldTtl.name);
  }
  if (legacy && legacy.name !== UNIQUE_INDEX_NAME) {
    await collection.dropIndex(legacy.name);
  }

  const result = {
    createdOrVerified: UNIQUE_INDEX_NAME,
    completedTtlIndex: COMPLETED_TTL_INDEX_NAME,
    droppedLegacyUniqueIndex: legacy ? legacy.name : null,
    droppedLegacyCreatedAtTtlIndex: oldTtl ? oldTtl.name : null
  };
  logger.log('Idempotency index migration applied:', JSON.stringify(result));
  return result;
}

async function main() {
  const { mongoUri } = validateMigrationConfig(process.env);
  let failed = false;
  try {
    await mongoose.connect(mongoUri);
    await migrateIdempotencyIndex(mongoose.connection.collection('idempotencykeys'), process.env);
  } catch (error) {
    failed = true;
    console.error('Idempotency index migration failed:', error.stack || error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); }
      catch (error) { failed = true; console.error('Database disconnect failed:', error.message); }
    }
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  migrateIdempotencyIndex,
  validateMigrationConfig,
  sameIndexKeys,
  findUniqueIndex,
  findTtlIndex,
  duplicateScopesPipeline,
  UNIQUE_INDEX_NAME,
  UNIQUE_INDEX_KEYS,
  LEGACY_INDEX_KEYS,
  COMPLETED_TTL_INDEX_NAME,
  COMPLETED_TTL_INDEX_KEYS,
  LEGACY_CREATED_TTL_KEYS
};
