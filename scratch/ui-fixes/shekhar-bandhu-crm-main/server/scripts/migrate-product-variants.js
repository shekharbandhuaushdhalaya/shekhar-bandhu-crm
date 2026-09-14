require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Connected to MongoDB');

    // Retrieve all products
    const allProducts = await Product.find({});
    console.log(`🔍 Found ${allProducts.length} total products in database.`);

    // Group products by normalized name (case-insensitive and trimmed)
    const groups = {};
    for (const p of allProducts) {
      const normName = p.name.trim().toUpperCase();
      if (!groups[normName]) {
        groups[normName] = [];
      }
      groups[normName].push(p);
    }

    let parentCount = 0;
    let childCount = 0;

    for (const normName of Object.keys(groups)) {
      const groupProducts = groups[normName];
      // Sort group by createdAt ascending, or ID if createdAt is not present
      groupProducts.sort((a, b) => a.createdAt - b.createdAt);

      const parent = groupProducts[0];
      
      // Update parent to ensure parentId is null
      parent.parentId = null;
      await parent.save();
      parentCount++;

      console.log(`👑 Parent designated: "${parent.name}" (SKU: ${parent.sku}, Size: ${parent.size || 'N/A'})`);

      // Update variants (children) to point to the parent and inherit shared fields
      for (let i = 1; i < groupProducts.length; i++) {
        const child = groupProducts[i];
        child.parentId = parent._id;
        
        // Sync shared fields from parent to child
        child.category = parent.category;
        child.description = parent.description;
        child.disease = parent.disease;
        child.ingredients = parent.ingredients;
        child.image = parent.image;
        child.productType = parent.productType;
        child.colour = parent.colour;
        child.shape = parent.shape;
        child.weight = parent.weight;
        child.hsnCode = parent.hsnCode;
        child.gstRate = parent.gstRate;

        await child.save();
        childCount++;
        console.log(`   └─ Variant (Child) linked: SKU ${child.sku}, Size: ${child.size || 'N/A'}`);
      }
    }

    console.log(`\n🎉 Migration complete! Designations: ${parentCount} parents, ${childCount} variants linked.`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
