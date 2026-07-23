require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const BatchProduction = require('../models/BatchProduction');
const Warehouse = require('../models/Warehouse');

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    let defaultWarehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    if (!defaultWarehouse) {
      console.log('⚠️ No warehouses found. Creating a default Varanasi Central Depot...');
      const createdWh = await Warehouse.create({
        name: "Varanasi Central Depot",
        city: "Varanasi",
        state: "Uttar Pradesh"
      });
      console.log(`🏭 Created warehouse: ${createdWh.name}`);
      defaultWarehouse = createdWh;
    }

    const batches = await BatchProduction.find({ warehouseId: { $exists: false } });
    console.log(`🔍 Found ${batches.length} batches needing migration...`);

    for (const batch of batches) {
      batch.warehouseId = defaultWarehouse._id;
      batch.warehouseName = defaultWarehouse.name;
      await batch.save();
      console.log(`✅ Migrated batch ${batch.batchNo} to ${defaultWarehouse.name}`);
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
