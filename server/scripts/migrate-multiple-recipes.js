require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BillOfMaterials = require('../models/BillOfMaterials');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  if (env.MIGRATE_RECIPES_CONFIRM !== 'YES') {
    throw new Error('Recipe migration requires MIGRATE_RECIPES_CONFIRM=YES.');
  }
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  return { mongoUri, firmId };
}

async function migrate(env = process.env) {
  const { mongoUri, firmId } = validateMigrationConfig(env);
  let failed = false;

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const boms = await BillOfMaterials.find({});
      console.log(`Found ${boms.length} bills of materials for firm ${firm._id}.`);

      let migrated = 0;
      for (const bom of boms) {
        let changed = false;
        if (!String(bom.recipeName || '').trim()) {
          bom.recipeName = 'Standard Recipe';
          changed = true;
        }
        if (bom.isDefault === undefined || bom.isDefault === null) {
          bom.isDefault = true;
          changed = true;
        }
        if (changed) {
          await bom.save();
          migrated += 1;
        }
      }
      console.log(`Recipe migration completed for firm ${firm._id}; updated ${migrated} BOMs.`);
    });
  } catch (error) {
    failed = true;
    console.error('Recipe migration failed:', error.message);
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
