const mongoose = require('mongoose');
const { assertDestructiveScriptAllowed } = require('./destructive-script-guard');

async function deleteSeedData() {
  try {
    assertDestructiveScriptAllowed(process.env, 'delete-seed-data');
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set.');

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    console.log('Connected to database. Deleting seed data...');

    // These operations remove every document in the listed collections, not just tagged seed records.
    const products = await db.collection('products').deleteMany({});
    console.log(`🗑️ Deleted ${products.deletedCount} products.`);

    const warehouses = await db.collection('warehouses').deleteMany({});
    console.log(`🗑️ Deleted ${warehouses.deletedCount} warehouses.`);

    const inventories = await db.collection('inventories').deleteMany({});
    console.log(`🗑️ Deleted ${inventories.deletedCount} inventory records.`);

    const inventoryEntries = await db.collection('inventoryentries').deleteMany({});
    console.log(`🗑️ Deleted ${inventoryEntries.deletedCount} inventory entries.`);

    console.log('✅ All documents in the selected collections have been removed.');
  } catch (err) {
    console.error('❌ Seed-data cleanup failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (err) {
        console.error('❌ Database disconnect failed:', err.message);
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) deleteSeedData();

module.exports = { deleteSeedData };
