/**
 * Migration: Fix batch ABH-010 packaging stock deduction
 * 
 * The packaging stage for ABH-010 deducted ~0.03 per material instead of
 * the correct qty (10 caps + 10 bottles for 10×450ml). This script:
 * 1. Restores the incorrectly deducted qty back to the original entries
 * 2. Removes the wrong ingredientsConsumed entries
 * 3. Resets the packaging stage's ingredientsDeducted flag
 * 
 * After running, the user can re-complete the packaging stage with correct values.
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const BATCH_NO = 'ABH-010';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu');
  console.log('Connected to MongoDB');

  const BatchProduction = require('../server/models/BatchProduction');
  const RawMaterialEntry = require('../server/models/RawMaterialEntry');

  const batch = await BatchProduction.findOne({ batchNo: BATCH_NO });
  if (!batch) {
    console.error('Batch not found:', BATCH_NO);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Found batch:', batch.batchNo, 'status:', batch.status);

  // Find the packaging stage
  const pkgStage = batch.stages.find(s =>
    s.name.toLowerCase().includes('packag') || s.name.toLowerCase().includes('packin')
  );
  if (!pkgStage) {
    console.error('No packaging stage found');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('Packaging stage:', pkgStage.name, 'ingredientsDeducted:', pkgStage.ingredientsDeducted);

  if (!pkgStage.ingredientsDeducted) {
    console.log('Stage already not marked as deducted — nothing to restore');
    await mongoose.disconnect();
    return;
  }

  // Find ingredientsConsumed entries that belong to packaging materials
  // (small fractional qty like 0.03 from the bug)
  const pkgRawMaterialIds = [];
  for (const ing of batch.ingredientsConsumed) {
    if (ing.qtyConsumed < 1 && ing.qtyConsumed > 0) {
      pkgRawMaterialIds.push({
        rawMaterialId: ing.rawMaterialId?.toString(),
        entryId: ing.rawMaterialEntryId?.toString(),
        qtyConsumed: ing.qtyConsumed,
        batchNo: ing.batchNo,
      });
    }
  }

  console.log('Found', pkgRawMaterialIds.length, 'suspicious packaging deductions:');
  console.log(JSON.stringify(pkgRawMaterialIds, null, 2));

  if (pkgRawMaterialIds.length === 0) {
    console.log('No small deductions found — nothing to restore');
    await mongoose.disconnect();
    return;
  }

  // Restore each incorrect deduction
  for (const item of pkgRawMaterialIds) {
    const entry = await RawMaterialEntry.findById(item.entryId);
    if (!entry) {
      console.warn('  Entry not found:', item.entryId);
      continue;
    }
    const oldQty = entry.qty;
    entry.qty = Number((entry.qty + item.qtyConsumed).toFixed(2));
    await entry.save();
    console.log(`  Restored ${item.qtyConsumed} to entry ${item.entryId}: ${oldQty} → ${entry.qty}`);
  }

  // Remove the restored entries from ingredientsConsumed
  const entryIdsToRemove = new Set(pkgRawMaterialIds.map(i => i.entryId));
  batch.ingredientsConsumed = batch.ingredientsConsumed.filter(
    ic => !entryIdsToRemove.has(ic.rawMaterialEntryId?.toString())
  );
  console.log('Removed', entryIdsToRemove.size, 'entries from ingredientsConsumed');

  // Reset the packaging stage deduction flag
  pkgStage.ingredientsDeducted = false;
  pkgStage.lossItems = [];
  console.log('Reset packaging stage ingredientsDeducted to false');

  // Also reset packagingDeducted on the batch if it was set
  if (batch.packagingDeducted) {
    batch.packagingDeducted = false;
    console.log('Reset batch.packagingDeducted to false');
  }

  await batch.save();
  console.log('Batch saved successfully');
  console.log('\nDone. The packaging stage can now be re-completed with correct values.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
