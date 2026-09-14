require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env');
  process.exit(1);
}

async function clearData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const collections = ['products', 'inventories', 'inventoryentries', 'warehouses', 'users', 'stockledgers', 'batchproductions'];

    for (const colName of collections) {
      try {
        const count = await mongoose.connection.db.collection(colName).countDocuments();
        if (count > 0) {
          await mongoose.connection.db.collection(colName).deleteMany({});
          console.log(`🗑️ Cleared ${count} documents from collection: ${colName}`);
        } else {
          console.log(`ℹ️ Collection ${colName} is already empty.`);
        }
      } catch (err) {
        console.error(`❌ Error clearing collection ${colName}:`, err.message);
      }
    }

    console.log('🎉 Data cleanup complete.');
  } catch (err) {
    console.error('❌ Database connection or operation failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

clearData();
