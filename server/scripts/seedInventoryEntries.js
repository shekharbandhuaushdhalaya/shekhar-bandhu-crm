/**
 * Script: seedInventoryEntries.js
 * Adds all products as InventoryEntry records under "Varanasi Central Depot" warehouse.
 * This uses the correct InventoryEntry model that the CRM reads from.
 *
 * Run: node scripts/seedInventoryEntries.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Product        = require('../models/Product');
const Warehouse      = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');

const WAREHOUSE_SEARCH = /varanasi central/i;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // 1. Find the warehouse
  const warehouse = await Warehouse.findOne({ name: WAREHOUSE_SEARCH });
  if (!warehouse) {
    console.error('❌ Warehouse "Varanasi Central Depot" not found. Please create it in the CRM first.');
    process.exit(1);
  }
  console.log(`🏭 Warehouse: ${warehouse.name} (${warehouse._id})`);

  // 2. Fetch all products
  const products = await Product.find({}).lean();
  console.log(`📦 ${products.length} products found\n`);

  let added = 0, skipped = 0;

  for (const p of products) {
    // Check for existing entry (same warehouse + product, no vendor)
    const exists = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId:   p._id,
      vendorId:    '',
      packing:     1,
    });

    if (exists) {
      console.log(`  ⏭  Skipped (exists): ${p.name}`);
      skipped++;
      continue;
    }

    await InventoryEntry.create({
      warehouseId:   warehouse._id,
      warehouseName: warehouse.name,
      productId:     p._id,
      productType:   p.name,
      size:          p.size    || '',
      colour:        p.colour  || '',
      shape:         p.shape   || '',
      weight:        p.weight  || '',
      hsnCode:       p.hsnCode || '30049099',
      vendorId:      '',
      vendorName:    '',
      qtyBoxes:      p.stockLevel || 0,
      packing:       1,
    });

    console.log(`  ✅ Added: ${p.name} — qty: ${p.stockLevel || 0}`);
    added++;
  }

  console.log(`\n🎉 Done! Added: ${added}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
