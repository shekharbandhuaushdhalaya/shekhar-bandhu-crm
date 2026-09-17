const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('../src/config'); // Validates env vars

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  
  // Find the firm
  const firm = await db.collection('firms').findOne();
  if (!firm) {
    console.log('❌ No firm found in the database. Please run the seed script first.');
    process.exit(1);
  }
  const firmId = firm._id;
  
  console.log(`✅ Found Firm: ${firm.name} (ID: ${firmId})`);
  
  const modelsToUpdate = ['products', 'warehouses', 'inventories', 'inventoryentries', 'stockledgers'];
  
  for (const collection of modelsToUpdate) {
    const res = await db.collection(collection).updateMany(
      { $or: [{ firmId: null }, { firmId: { $exists: false } }] },
      { $set: { firmId: firmId } }
    );
    console.log(`Updated ${res.modifiedCount} missing firmIds in collection: ${collection}`);
  }
  
  console.log('🎉 Done! All seeded data is now linked to your firm.');
  process.exit(0);
}).catch(err => {
  console.error('Database connection error:', err);
  process.exit(1);
});
