const mongoose = require('mongoose');

// Connect to MongoDB
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI is not set. Please set your environment variable.');
  process.exit(1);
}

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  
  console.log('Connected to database. Deleting seeded data...');

  // 1. Delete all Products
  const products = await db.collection('products').deleteMany({});
  console.log(`🗑️ Deleted ${products.deletedCount} products.`);

  // 2. Delete all Warehouses
  const warehouses = await db.collection('warehouses').deleteMany({});
  console.log(`🗑️ Deleted ${warehouses.deletedCount} warehouses.`);

  // 3. Delete all Inventory Ledgers
  const inventories = await db.collection('inventories').deleteMany({});
  console.log(`🗑️ Deleted ${inventories.deletedCount} inventory records.`);

  const inventoryEntries = await db.collection('inventoryentries').deleteMany({});
  console.log(`🗑️ Deleted ${inventoryEntries.deletedCount} inventory entries.`);

  console.log('✅ All seed data has been successfully removed! Your User and Firm were kept safe.');
  process.exit(0);
}).catch(err => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});
