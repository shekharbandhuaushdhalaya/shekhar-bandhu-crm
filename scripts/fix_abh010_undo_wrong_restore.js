/**
 * Fix: Re-deduct formulation ingredients that were incorrectly restored
 * by fix_abh010_packaging_deduction.js (which used qty<1 filter too broadly).
 *
 * These 3 ingredients were tied to CLEANING/BOILING/MIXING stages and
 * should NOT have been restored:
 *   CHANDAN  → entry 6a68b0de092366f44594350a  → 0.45 kg
 *   PRYANGU  → entry 6a68b0df092366f44594350e  → 0.45 kg
 *   KAMAL    → entry 6a68b0df092366f445943512  → 0.75 kg
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });

const BATCH_NO = 'ABH-010';

const FORMULATION_RESTORES = [
  { rawMaterialId: '6a68aed6092366f4459433df', entryId: '6a68b0de092366f44594350a', qty: 0.45, name: 'CHANDAN' },
  { rawMaterialId: '6a68af10092366f445943415', entryId: '6a68b0df092366f44594350e', qty: 0.45, name: 'PRYANGU' },
  { rawMaterialId: '6a68af22092366f445943431', entryId: '6a68b0df092366f445943512', qty: 0.75, name: 'KAMAL' },
];

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
  console.log('Found batch:', batch.batchNo);

  for (const item of FORMULATION_RESTORES) {
    const entry = await RawMaterialEntry.findById(item.entryId);
    if (!entry) {
      console.warn(`  Entry ${item.entryId} not found — skipping`);
      continue;
    }
    if (entry.qty < item.qty - 0.001) {
      console.warn(`  Entry ${item.entryId} has ${entry.qty} — not enough to re-deduct ${item.qty}. Another batch may have consumed from it. Skipping.`);
      continue;
    }
    const oldQty = entry.qty;
    entry.qty = Number((entry.qty - item.qty).toFixed(2));
    await entry.save();
    console.log(`  Re-deducted ${item.qty} ${item.name} from entry ${item.entryId}: ${oldQty} → ${entry.qty}`);

    batch.rawMaterialCost += item.qty * (entry.purchaseRate || 0);
    batch.ingredientsConsumed.push({
      rawMaterialId: new mongoose.Types.ObjectId(item.rawMaterialId),
      rawMaterialEntryId: entry._id,
      qtyConsumed: item.qty,
      batchNo: entry.batchNo || 'PUR-PUR-001',
    });
    console.log(`  Added back to ingredientsConsumed: ${item.name} ${item.qty}`);
  }

  await batch.save();
  console.log('Batch saved. Formulation deductions restored.');
  await mongoose.disconnect();
}

main().catch(err => { console.error('Script failed:', err); process.exit(1); });
