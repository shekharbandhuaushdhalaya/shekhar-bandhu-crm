/**
 * Tenant-scoped migration of legacy billing modes and party balance field names.
 *
 * Dry-run is the default. Balance renames are skipped when the destination field
 * already exists so a legacy value can never overwrite a current balance.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Firm = require('../models/Firm');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  const apply = env.MIGRATE_BILLING_MODES_APPLY === 'YES';
  if (apply && env.MIGRATE_BILLING_MODES_CONFIRM !== 'YES') {
    throw new Error('Applying billing migration requires MIGRATE_BILLING_MODES_CONFIRM=YES.');
  }
  return { mongoUri, firmId, apply };
}

const BALANCE_RENAMES = [
  { collection: 'customers', from: 'kachhaBalance', to: 'cashBalance' },
  { collection: 'customers', from: 'pakkaBalance', to: 'regularBalance' },
  { collection: 'vendors', from: 'kachhaBalance', to: 'cashBalance' },
  { collection: 'vendors', from: 'pakkaBalance', to: 'regularBalance' }
];

const MODE_RENAMES = [
  { collection: 'stockmovements', field: 'billingMode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'stockmovements', field: 'billingMode', from: ['pakka'], to: 'regular' },
  { collection: 'invoices', field: 'mode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'invoices', field: 'mode', from: ['pakka'], to: 'regular' },
  { collection: 'payments', field: 'mode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'payments', field: 'mode', from: ['pakka'], to: 'regular' },
  { collection: 'ledgerentries', field: 'mode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'ledgerentries', field: 'mode', from: ['pakka'], to: 'regular' },
  { collection: 'quotations', field: 'mode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'quotations', field: 'mode', from: ['pakka'], to: 'regular' },
  { collection: 'challans', field: 'mode', from: ['kaccha', 'kachha'], to: 'cash' },
  { collection: 'challans', field: 'mode', from: ['pakka'], to: 'regular' }
];

async function migrate(env = process.env) {
  const { mongoUri, firmId, apply } = validateMigrationConfig(env);
  let failed = false;
  const summary = { balanceRenames: [], balanceConflicts: [], modeUpdates: [] };

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    const db = mongoose.connection.db;
    const tenantId = new mongoose.Types.ObjectId(String(firm._id));

    for (const rename of BALANCE_RENAMES) {
      const collection = db.collection(rename.collection);
      const sourceExists = { firmId: tenantId, [rename.from]: { $exists: true } };
      const safeFilter = {
        $and: [sourceExists, { [rename.to]: { $exists: false } }]
      };
      const conflictFilter = {
        $and: [sourceExists, { [rename.to]: { $exists: true } }]
      };
      const [candidates, conflicts] = await Promise.all([
        collection.countDocuments(safeFilter),
        collection.countDocuments(conflictFilter)
      ]);
      summary.balanceRenames.push({ ...rename, candidates, updated: 0 });
      summary.balanceConflicts.push({ ...rename, conflicts });
      if (apply && candidates > 0) {
        const result = await collection.updateMany(safeFilter, { $rename: { [rename.from]: rename.to } });
        summary.balanceRenames[summary.balanceRenames.length - 1].updated = result.modifiedCount;
      }
    }

    for (const mapping of MODE_RENAMES) {
      const collection = db.collection(mapping.collection);
      const filter = { firmId: tenantId, [mapping.field]: { $in: mapping.from } };
      const candidates = await collection.countDocuments(filter);
      const entry = { ...mapping, candidates, updated: 0 };
      summary.modeUpdates.push(entry);
      if (apply && candidates > 0) {
        const result = await collection.updateMany(filter, { $set: { [mapping.field]: mapping.to } });
        entry.updated = result.modifiedCount;
      }
    }

    const totals = {
      balanceCandidates: summary.balanceRenames.reduce((sum, item) => sum + item.candidates, 0),
      balanceConflicts: summary.balanceConflicts.reduce((sum, item) => sum + item.conflicts, 0),
      modeCandidates: summary.modeUpdates.reduce((sum, item) => sum + item.candidates, 0)
    };
    console.log(`${apply ? 'Billing migration applied' : 'Billing migration dry run'} for firm ${firm._id}:`, JSON.stringify({ ...totals, details: summary }, null, 2));
    if (!apply) {
      console.log('No records changed. Review the candidates and balance conflicts, then set MIGRATE_BILLING_MODES_APPLY=YES and MIGRATE_BILLING_MODES_CONFIRM=YES to apply.');
    }
    if (totals.balanceConflicts > 0) {
      console.warn('Some legacy balance fields coexist with destination balance fields. They were deliberately left unchanged for manual reconciliation.');
    }
  } catch (error) {
    failed = true;
    console.error('Billing migration failed:', error.message);
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
module.exports = { migrate, validateMigrationConfig, BALANCE_RENAMES, MODE_RENAMES };
