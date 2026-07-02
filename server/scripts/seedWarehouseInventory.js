/**
 * Script: seedWarehouseInventory.js
 * Adds all products as inventory entries under the
 * "Varanasi Central Deposit" warehouse (creates it if it doesn't exist).
 *
 * Run: node scripts/seedWarehouseInventory.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// ── Models ──────────────────────────────────────────────────
const Product   = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const Inventory = require('../models/Inventory');

const WAREHOUSE_NAME = 'Varanasi Central Deposit';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // 1. Find or create the warehouse
  let warehouse = await Warehouse.findOne({ name: { $regex: /varanasi central/i } });
  if (!warehouse) {
    warehouse = await Warehouse.create({
      name:          WAREHOUSE_NAME,
      addressLine1:  'Shekhar Bandhu Aushadhalaya',
      addressLine2:  'Industrial Area, Lanka',
      city:          'Varanasi',
      state:         'Uttar Pradesh',
      pincode:       '221005',
      contactPerson: 'Store Manager',
      phone:         '',
    });
    console.log(`🏭 Created warehouse: ${warehouse.name} (${warehouse._id})`);
  } else {
    console.log(`🏭 Found warehouse: ${warehouse.name} (${warehouse._id})`);
  }

  // 2. Fetch all products
  const products = await Product.find({}).lean();
  console.log(`📦 Found ${products.length} products to process`);

  let added = 0;
  let skipped = 0;

  for (const p of products) {
    // Check if an inventory entry already exists for this product in this warehouse
    const exists = await Inventory.findOne({
      warehouse: WAREHOUSE_NAME,
      itemSku:   p.sku,
    });

    if (exists) {
      console.log(`  ⏭  Already exists: ${p.sku} — ${p.name}`);
      skipped++;
      continue;
    }

    await Inventory.create({
      warehouse:  WAREHOUSE_NAME,
      itemSku:    p.sku,
      itemName:   p.name,
      qty:        p.stockLevel || 0,
      minReorder: p.minReorder || 5,
      val:        p.price || 0,
    });

    console.log(`  ✅ Added: ${p.sku} — ${p.name} (qty: ${p.stockLevel || 0})`);
    added++;
  }

  console.log(`\n🎉 Done! Added: ${added}, Skipped (already existed): ${skipped}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
