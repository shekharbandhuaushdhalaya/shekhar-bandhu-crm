require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BillOfMaterials = require('../models/BillOfMaterials');

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    const boms = await BillOfMaterials.find({});
    console.log(`🔍 Found ${boms.length} Bill of Materials documents to migrate.`);

    let count = 0;
    for (const bom of boms) {
      bom.recipeName = bom.recipeName || 'Standard Recipe';
      bom.isDefault = bom.isDefault !== undefined ? bom.isDefault : true;
      await bom.save();
      count++;
      console.log(`✅ Migrated BOM for Product ID ${bom.productId}: Set recipeName="${bom.recipeName}", isDefault=${bom.isDefault}`);
    }

    console.log(`🎉 Migration complete. Migrated ${count} BOMs.`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
