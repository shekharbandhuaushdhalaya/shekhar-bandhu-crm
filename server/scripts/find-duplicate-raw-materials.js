require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm';

async function findDuplicateRawMaterials() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const materials = await RawMaterial.find({}).lean();
    console.log(`📋 Total RawMaterial records in DB: ${materials.length}`);

    const groups = {};

    for (const rm of materials) {
      const normalizedName = RawMaterial.normalizeName(rm.name);
      const unit = (rm.unit || 'kg').toLowerCase().trim();
      const category = (rm.category || 'Herb').toLowerCase().trim();
      const key = `${normalizedName}::${unit}::${category}`;

      if (!groups[key]) {
        groups[key] = {
          normalizedName,
          unit: rm.unit,
          category: rm.category,
          records: [],
        };
      }
      groups[key].records.push(rm);
    }

    const duplicateGroups = Object.values(groups).filter(g => g.records.length > 1);

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate raw materials found. It is safe to deploy the unique index!');
    } else {
      console.log(`\n⚠️  FOUND ${duplicateGroups.length} DUPLICATE GROUP(S):\n`);

      for (const group of duplicateGroups) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📦 Duplicate Group: "${group.records[0].name}" [Unit: ${group.unit}, Category: ${group.category}]`);
        console.log(`   Matching key: ${group.normalizedName}::${group.unit.toLowerCase()}::${group.category.toLowerCase()}`);
        console.log(`   Records (${group.records.length}):`);

        for (const rm of group.records) {
          const entryCount = await RawMaterialEntry.countDocuments({ rawMaterialId: rm._id });
          console.log(`   - ID: ${rm._id}`);
          console.log(`     SKU: ${rm.sku}`);
          console.log(`     Name: "${rm.name}"`);
          console.log(`     Unit: ${rm.unit}`);
          console.log(`     Category: ${rm.category}`);
          console.log(`     Active Stock Lots (RawMaterialEntry): ${entryCount}`);
        }
        console.log('');
      }

      console.log('⚠️  Please resolve/merge duplicate records before building the unique index in production.');
    }

  } catch (err) {
    console.error('❌ Script failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

findDuplicateRawMaterials();
