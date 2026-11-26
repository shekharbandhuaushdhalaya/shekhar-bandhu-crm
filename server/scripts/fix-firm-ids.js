const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('../src/config'); // Validates env vars
const { assertDestructiveScriptAllowed } = require('./destructive-script-guard');

const COLLECTIONS_TO_UPDATE = ['products', 'warehouses', 'inventories', 'inventoryentries', 'stockledgers'];

async function backfillFirmIds(db, firmId) {
  const value = String(firmId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error('FIRM_ID_BACKFILL_TARGET must be a valid MongoDB ObjectId.');
  }

  const targetFirmId = new mongoose.Types.ObjectId(value);
  const firm = await db.collection('firms').findOne({ _id: targetFirmId }, { projection: { _id: 1, name: 1 } });
  if (!firm) throw new Error('FIRM_ID_BACKFILL_TARGET does not match an existing firm.');

  const results = [];
  for (const collectionName of COLLECTIONS_TO_UPDATE) {
    const result = await db.collection(collectionName).updateMany(
      { $or: [{ firmId: null }, { firmId: { $exists: false } }] },
      { $set: { firmId: targetFirmId } }
    );
    results.push({ collection: collectionName, modifiedCount: result.modifiedCount });
  }
  return { firm, results };
}

async function main() {
  let failed = false;
  try {
    assertDestructiveScriptAllowed(process.env, 'fix-firm-ids');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    const firmId = String(process.env.FIRM_ID_BACKFILL_TARGET || '').trim();
    if (!firmId) throw new Error('FIRM_ID_BACKFILL_TARGET is required; refusing to select a firm automatically.');

    await mongoose.connect(process.env.MONGODB_URI);
    const { firm, results } = await backfillFirmIds(mongoose.connection.db, firmId);
    console.log(`Target firm: ${firm.name || firm._id} (${firm._id})`);
    for (const result of results) {
      console.log(`Updated ${result.modifiedCount} missing firmIds in collection: ${result.collection}`);
    }
    console.log('Firm ID backfill completed.');
  } catch (error) {
    failed = true;
    console.error('Firm ID backfill failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        failed = true;
        console.error('Database disconnect failed:', error.message);
      }
    }
    process.exitCode = failed ? 1 : 0;
  }
}

if (require.main === module) main();

module.exports = { backfillFirmIds, COLLECTIONS_TO_UPDATE };
