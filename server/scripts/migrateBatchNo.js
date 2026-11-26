require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  const apply = env.MIGRATE_BATCH_DATA_APPLY === 'YES';
  if (apply && env.MIGRATE_BATCH_DATA_CONFIRM !== 'YES') {
    throw new Error('Applying batch data repairs requires MIGRATE_BATCH_DATA_CONFIRM=YES.');
  }
  return { mongoUri, firmId, apply };
}

async function migrate(env = process.env) {
  const { mongoUri, firmId, apply } = validateMigrationConfig(env);
  let failed = false;

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const repairs = [
        {
          label: 'InventoryEntry missing/null batchNo',
          Model: InventoryEntry,
          filter: { $or: [{ batchNo: { $exists: false } }, { batchNo: null }] },
          update: { $set: { batchNo: '' } }
        },
        {
          label: 'InventoryEntry packing = 0',
          Model: InventoryEntry,
          filter: { packing: 0 },
          update: { $set: { packing: 1 } }
        },
        {
          label: 'StockLedger missing/null batchNo',
          Model: StockLedger,
          filter: { $or: [{ batchNo: { $exists: false } }, { batchNo: null }] },
          update: { $set: { batchNo: '' } }
        },
        {
          label: 'StockLedger packing = 0',
          Model: StockLedger,
          filter: { packing: 0 },
          update: { $set: { packing: 1 } }
        }
      ];

      let totalCandidates = 0;
      for (const repair of repairs) {
        const count = await repair.Model.countDocuments(repair.filter);
        totalCandidates += count;
        console.log(`${repair.label}: ${count} candidate records.`);
        if (apply && count > 0) {
          const result = await repair.Model.updateMany(repair.filter, repair.update);
          console.log(`${repair.label}: updated ${result.modifiedCount} records.`);
        }
      }

      if (apply) {
        console.log(`Batch data repairs applied for firm ${firm._id}: ${totalCandidates} candidate matches across ${repairs.length} repair rules.`);
      } else {
        console.log(`Dry run only for firm ${firm._id}: ${totalCandidates} candidate matches; no records changed. Review the counts, then set MIGRATE_BATCH_DATA_APPLY=YES and MIGRATE_BATCH_DATA_CONFIRM=YES to apply.`);
      }
    });
  } catch (error) {
    failed = true;
    console.error('Batch data migration failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        failed = true;
        console.error('Database disconnect failed:', error.message);
      }
    }
  }

  if (failed) process.exitCode = 1;
}

if (require.main === module) migrate();

module.exports = { migrate, validateMigrationConfig };
