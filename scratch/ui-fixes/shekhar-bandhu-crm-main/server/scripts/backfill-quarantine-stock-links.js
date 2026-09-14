const mongoose = require('mongoose');
const RawMaterialQuarantine = require('../models/RawMaterialQuarantine');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const RawMaterial = require('../models/RawMaterial');

async function backfillQuarantineStockLinks() {
  const quarantines = await RawMaterialQuarantine.find({
    $or: [{ rawMaterialEntryId: null }, { rawMaterialEntryId: { $exists: false } }]
  });

  console.log(`[Backfill] Found ${quarantines.length} unlinked quarantine records.`);

  let linkedCount = 0;
  let unlinkedCount = 0;

  for (const q of quarantines) {
    let entry = null;

    if (q.batchNo) {
      entry = await RawMaterialEntry.findOne({ batchNo: q.batchNo });
    }

    if (!entry && q.herbName) {
      const rawMat = await RawMaterial.findOne({
        name: { $regex: new RegExp(`^${q.herbName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }
      });
      if (rawMat) {
        entry = await RawMaterialEntry.findOne({ rawMaterialId: rawMat._id });
      }
    }

    if (entry) {
      q.rawMaterialEntryId = entry._id;
      q.rawMaterialId = entry.rawMaterialId;

      // Sync qcStatus if quarantine record is already released or rejected
      if (q.quarantineStatus === 'released') {
        entry.qcStatus = 'approved';
        await entry.save();
      } else if (q.quarantineStatus === 'rejected') {
        entry.qcStatus = 'rejected';
        await entry.save();
      }

      await q.save();
      linkedCount++;
      console.log(`[Backfill] Linked Quarantine ${q.quarantineLotNo} (Batch: ${q.batchNo}) -> RawMaterialEntry ${entry._id}`);
    } else {
      unlinkedCount++;
      console.warn(`[Backfill] Could NOT link Quarantine ${q.quarantineLotNo} (Batch: ${q.batchNo}, Herb: ${q.herbName})`);
    }
  }

  console.log(`[Backfill] Completed: ${linkedCount} linked, ${unlinkedCount} unlinked.`);
}

if (require.main === module) {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm';
  mongoose.connect(MONGO_URI)
    .then(async () => {
      await backfillQuarantineStockLinks();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = backfillQuarantineStockLinks;
