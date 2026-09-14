/**
 * Full fix for batch ABH-010 packaging stock deduction
 *
 * The packaging stage used actualQty=0.033 (stale value) instead of 10.
 * This script:
 * 1. Deducts the CORRECT packaging qty (10 per material for 10×450ml)
 * 2. Adds proper ingredientsConsumed entries
 * 3. Marks packaging stage as correctly deducted
 * 4. Restores batch to completed status
 *
 * Skip materials already in ingredientsConsumed (e.g. 450 ML. BOTTLE had 1.03
 * from a previous correct deduction).
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const BATCH_NO = 'ABH-010';

// Expected packaging materials and their correct qty (per-yield × 10 qty)
const PACKAGING_DEDUCTIONS = [
  { rawMaterialId: '6a664aa27f8450f46d727499', name: '25 MM. CAP', qty: 10 },
  { rawMaterialId: '6a68af85092366f44594346a', name: 'CHANDANASAVA 450 ML. BOX', qty: 10 },
  { rawMaterialId: '6a68af5e092366f44594344f', name: 'CHANDANASAVA 450 ML. LABEL', qty: 10 },
  { rawMaterialId: '6a672e16d8acb5844ea37091', name: '450 ML. BOTTLE', qty: 10 },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu');
  console.log('Connected');

  const BatchProduction = require('../server/models/BatchProduction');
  const RawMaterialEntry = require('../server/models/RawMaterialEntry');

  const batch = await BatchProduction.findOne({ batchNo: BATCH_NO });
  if (!batch) { console.error('Not found'); process.exit(1); }

  for (const pkg of PACKAGING_DEDUCTIONS) {
    // Calculate how much was already consumed for this RM (includes non-buggy deductions)
    const alreadyConsumedQty = batch.ingredientsConsumed
      .filter(c => c.rawMaterialId?.toString() === pkg.rawMaterialId)
      .reduce((sum, c) => sum + (c.qtyConsumed || 0), 0);

    const needed = Math.max(0, Number((pkg.qty - alreadyConsumedQty).toFixed(2)));

    if (needed <= 0.001) {
      console.log(`  ${pkg.name}: already consumed ${alreadyConsumedQty}/${pkg.qty} — skip`);
      continue;
    }

    console.log(`  ${pkg.name}: already consumed ${alreadyConsumedQty}/${pkg.qty}, deducting remaining ${needed}`);

    const entries = await RawMaterialEntry.find({ rawMaterialId: pkg.rawMaterialId, warehouseId: batch.manufacturingUnitId })
      .sort({ createdAt: 1 });

    let remaining = needed;
    for (const entry of entries) {
      if (remaining <= 0.001) break;
      if ((entry.qty || 0) <= 0) continue;
      const deduct = Math.min(remaining, entry.qty);
      const finalDeduct = Number(deduct.toFixed(2));
      if (finalDeduct <= 0) continue;

      entry.qty = Math.max(0, Number((entry.qty - finalDeduct).toFixed(2)));
      await entry.save();

      batch.rawMaterialCost += finalDeduct * (entry.purchaseRate || 0);
      batch.ingredientsConsumed.push({
        rawMaterialId: new mongoose.Types.ObjectId(pkg.rawMaterialId),
        rawMaterialEntryId: entry._id,
        qtyConsumed: finalDeduct,
        batchNo: entry.batchNo || '',
      });
      console.log(`    deducted ${finalDeduct} from entry ${entry._id} (${Number((entry.qty + finalDeduct).toFixed(2))} → ${entry.qty})`);
      remaining -= finalDeduct;
    }

    if (remaining > 0.001) {
      console.warn(`  ⚠ ${pkg.name}: insufficient stock! Needed ${remaining} more`);
    }
  }

  // Mark packaging stage as correctly deducted
  const pkgStage = batch.stages.find(s => s.name.toUpperCase() === 'PACKING');
  if (pkgStage) {
    pkgStage.ingredientsDeducted = true;
    pkgStage.status = 'completed';
  }

  batch.packagingDeducted = true;
  batch.status = 'completed';

  await batch.save();
  console.log('\nBatch ABH-010 fixed and restored to completed status.');
  console.log('All packaging materials correctly deducted.');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
