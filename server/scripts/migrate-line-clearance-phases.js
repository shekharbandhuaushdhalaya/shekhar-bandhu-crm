/**
 * Safely replaces the legacy global unique batchId index with the tenant-aware
 * unique (firmId, batchId, phase) index declared by the LineClearance model.
 *
 * Dry-run is the default. Apply requires two exact confirmation flags.
 * The new index is created before the legacy index is removed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const LineClearance = require('../models/LineClearance');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const apply = env.MIGRATE_LINE_CLEARANCE_PHASES_APPLY === 'YES';
  if (apply && env.MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM !== 'YES') {
    throw new Error('Applying line-clearance index migration requires MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM=YES.');
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

function getTenantUniqueIndex(schema = LineClearance.schema) {
  const match = schema.indexes().find(([keys, options]) =>
    options?.unique === true &&
    sameIndexKeys(keys, { firmId: 1, batchId: 1, phase: 1 }) &&
    options.partialFilterExpression?.firmId?.$type === 'objectId');
  if (!match) {
    throw new Error('LineClearance schema is missing its tenant-scoped unique (firmId, batchId, phase) index.');
  }
  return match;
}

function findLegacyUniqueIndex(indexes) {
  return indexes.find(index =>
    index.unique === true && sameIndexKeys(index.key, { batchId: 1 })) || null;
}

function duplicateGroupsPipeline() {
  return [
    { $match: { firmId: { $type: 'objectId' } } },
    {
      $group: {
        _id: { firmId: '$firmId', batchId: '$batchId', phase: '$phase' },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 1, count: 1, ids: { $slice: ['$ids', 10] } } },
    { $limit: 100 }
  ];
}

async function migrate(env = process.env) {
  const { mongoUri, apply } = validateMigrationConfig(env);
  let failed = false;
  const summary = { apply, targetIndex: null, legacyIndex: null, duplicateGroups: [], created: false, dropped: false };

  try {
    await mongoose.connect(mongoUri);
    const collection = LineClearance.collection;
    const indexes = await collection.indexes();
    const [keys, options] = getTenantUniqueIndex();
    summary.targetIndex = { keys, options };

    const existingTarget = indexes.find(index =>
      index.unique === true &&
      sameIndexKeys(index.key, keys) &&
      index.partialFilterExpression?.firmId?.$type === 'objectId');
    const legacy = findLegacyUniqueIndex(indexes);
    summary.legacyIndex = legacy ? { name: legacy.name, key: legacy.key } : null;

    summary.duplicateGroups = await collection.aggregate(duplicateGroupsPipeline()).toArray();
    if (summary.duplicateGroups.length) {
      throw new Error(
        `Cannot create tenant-aware unique index: found at least ${summary.duplicateGroups.length} duplicate (firmId, batchId, phase) groups. Resolve them manually before retrying.`
      );
    }

    if (!apply) {
      console.log('Line-clearance index migration dry run:', JSON.stringify({
        ...summary,
        duplicateGroups: 0,
        nextSteps: [
          'Review the target tenant-scoped unique index and legacy index.',
          'Resolve any duplicate (firmId, batchId, phase) records reported by this dry run.',
          'To apply, set MIGRATE_LINE_CLEARANCE_PHASES_APPLY=YES and MIGRATE_LINE_CLEARANCE_PHASES_CONFIRM=YES.'
        ]
      }, null, 2));
      console.log('No database indexes changed.');
      return summary;
    }

    if (!existingTarget) {
      await collection.createIndex(keys, options);
      summary.created = true;
    }

    // Keep the old constraint until the replacement is confirmed present.
    if (legacy) {
      await collection.dropIndex(legacy.name);
      summary.dropped = true;
    }

    console.log('Line-clearance index migration applied:', JSON.stringify(summary, null, 2));
  } catch (error) {
    failed = true;
    console.error('Line-clearance index migration failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); }
      catch (error) { failed = true; console.error('Database disconnect failed:', error.message); }
    }
  }

  if (failed) process.exitCode = 1;
  return summary;
}

if (require.main === module) migrate();
module.exports = {
  migrate,
  validateMigrationConfig,
  sameIndexKeys,
  getTenantUniqueIndex,
  findLegacyUniqueIndex,
  duplicateGroupsPipeline
};
