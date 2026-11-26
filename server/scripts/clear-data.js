require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { assertDestructiveScriptAllowed } = require('./destructive-script-guard');

const MONGODB_URI = process.env.MONGODB_URI;

async function clearData() {
  let failed = false;
  try {
    assertDestructiveScriptAllowed(process.env, 'clear-data');
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not set in .env');

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const collections = ['products', 'inventories', 'inventoryentries', 'warehouses', 'users', 'stockledgers', 'batchproductions'];

    for (const colName of collections) {
      try {
        const collection = mongoose.connection.db.collection(colName);
        const count = await collection.countDocuments();
        if (count > 0) {
          await collection.deleteMany({});
          console.log(`🗑️ Cleared ${count} documents from collection: ${colName}`);
        } else {
          console.log(`ℹ️ Collection ${colName} is already empty.`);
        }
      } catch (err) {
        failed = true;
        console.error(`❌ Error clearing collection ${colName}:`, err.message);
      }
    }

    if (failed) throw new Error('One or more collections could not be cleared.');
    console.log('🎉 Data cleanup complete.');
  } catch (err) {
    failed = true;
    console.error('❌ Data cleanup failed:', err.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
      } catch (err) {
        failed = true;
        console.error('❌ Database disconnect failed:', err.message);
      }
    }
    process.exitCode = failed ? 1 : 0;
  }
}

if (require.main === module) clearData();

module.exports = { clearData };
