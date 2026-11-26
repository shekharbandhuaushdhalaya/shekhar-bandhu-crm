require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BatchProduction = require('../models/BatchProduction');
const ManufacturingUnit = require('../models/ManufacturingUnit');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

function validateMigrationConfig(env = process.env) {
  if (!String(env.MONGODB_URI || '').trim()) {
    throw new Error('MONGODB_URI is required.');
  }
  if (env.MIGRATE_BATCHES_CONFIRM !== 'YES') {
    throw new Error('Batch migration requires MIGRATE_BATCHES_CONFIRM=YES.');
  }
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  return { mongoUri: String(env.MONGODB_URI).trim(), firmId };
}

async function migrate(env = process.env) {
  const { mongoUri, firmId } = validateMigrationConfig(env);
  let failed = false;

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const defaultUnit = await ManufacturingUnit.findOne().sort({ createdAt: 1 });
      if (!defaultUnit) {
        throw new Error('No manufacturing unit exists for the selected firm. Create and verify one before migrating batches.');
      }

      const batches = await BatchProduction.find({
        $or: [
          { manufacturingUnitId: { $exists: false } },
          { manufacturingUnitId: null }
        ]
      });
      console.log(`Found ${batches.length} batches needing manufacturing unit migration for firm ${firm._id}.`);

      for (const batch of batches) {
        batch.manufacturingUnitId = defaultUnit._id;
        batch.manufacturingUnitName = defaultUnit.name;
        await batch.save();
        console.log(`Migrated batch ${batch.batchNo} to ${defaultUnit.name}.`);
      }
      console.log(`Batch migration completed for firm ${firm._id}.`);
    });
  } catch (error) {
    failed = true;
    console.error('Batch migration failed:', error.message);
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
