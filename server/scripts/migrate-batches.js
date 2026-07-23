require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BatchProduction = require('../models/BatchProduction');
const ManufacturingUnit = require('../models/ManufacturingUnit');

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    let defaultUnit = await ManufacturingUnit.findOne().sort({ createdAt: 1 });
    if (!defaultUnit) {
      console.log('⚠️ No manufacturing units found. Creating a default Plant...');
      defaultUnit = await ManufacturingUnit.create({
        name: "Shekhar Bandhu Manufacturing Plant 1",
        code: "MFG-PLANT-1",
        addressLine1: "Industrial Area Phase 2",
        city: "Varanasi",
        state: "Uttar Pradesh",
        pincode: "221002"
      });
      console.log(`🏭 Created manufacturing unit: ${defaultUnit.name}`);
    }

    const batches = await BatchProduction.find({ manufacturingUnitId: { $exists: false } });
    console.log(`🔍 Found ${batches.length} batches needing manufacturing unit migration...`);

    for (const batch of batches) {
      batch.manufacturingUnitId = defaultUnit._id;
      batch.manufacturingUnitName = defaultUnit.name;
      // Remove deprecated warehouse fields from model if we want to, though Mongoose schema handles undefined/unmapped fields
      await batch.save();
      console.log(`✅ Migrated batch ${batch.batchNo} to ${defaultUnit.name}`);
    }

    console.log('🎉 Migration complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
