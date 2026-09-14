/**
 * Migration: Fix data quality issues
 * 1. Set batchNo = '' on all InventoryEntry documents missing the field
 * 2. Fix packing = 0 entries (set to 1 as safe default)
 * 3. Fix packing = 0 entries in StockLedger
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // 1. Fix InventoryEntry docs missing batchNo
  const ieMissing = await InventoryEntry.updateMany(
    { batchNo: { $exists: false } },
    { $set: { batchNo: '' } }
  );
  console.log(`✅ InventoryEntry: ${ieMissing.modifiedCount} docs — set missing batchNo = ''`);

  // 2. Fix docs where batchNo is null
  const ieNull = await InventoryEntry.updateMany(
    { batchNo: null },
    { $set: { batchNo: '' } }
  );
  console.log(`✅ InventoryEntry: ${ieNull.modifiedCount} docs — replaced null batchNo with ''`);

  // 3. Fix packing = 0 in InventoryEntry (set to 1)
  const iePackZero = await InventoryEntry.updateMany(
    { packing: 0 },
    { $set: { packing: 1 } }
  );
  console.log(`✅ InventoryEntry: ${iePackZero.modifiedCount} docs — fixed packing 0 → 1`);

  // 4. Fix packing = 0 in StockLedger
  const slPackZero = await StockLedger.updateMany(
    { packing: 0 },
    { $set: { packing: 1 } }
  );
  console.log(`✅ StockLedger: ${slPackZero.modifiedCount} docs — fixed packing 0 → 1`);

  // 5. Fix StockLedger docs missing batchNo
  const slBatch = await StockLedger.updateMany(
    { batchNo: { $exists: false } },
    { $set: { batchNo: '' } }
  );
  console.log(`✅ StockLedger: ${slBatch.modifiedCount} docs — set missing batchNo = ''`);

  await mongoose.disconnect();
  console.log('✅ Migration complete');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
