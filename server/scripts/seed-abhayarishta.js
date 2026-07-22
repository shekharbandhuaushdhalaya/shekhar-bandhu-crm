/**
 * Seeding script: Seed inventory with ABHAYARISHTA (450ml) - 20 pcs
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// Models
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const Inventory = require('../models/Inventory');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // 1. Find or create the product
  let product = await Product.findOne({ name: 'ABHAYARISHTA (450ml)' });
  if (!product) {
    product = await Product.create({
      name: 'ABHAYARISHTA (450ml)',
      sku: 'ABHAY-450ML',
      price: 150,
      mrp: 180,
      hsnCode: '30049011',
      gstRate: 12,
      size: '450ml',
      productType: 'Arishta',
      description: 'Ayurvedic classical medicine for digestive health.'
    });
    console.log(`📦 Created Product: ${product.name}`);
  } else {
    console.log(`📦 Found Product: ${product.name}`);
  }

  // 2. Find all warehouses
  let warehouses = await Warehouse.find({});
  if (warehouses.length === 0) {
    const defaultWarehouse = await Warehouse.create({
      name: 'Varanasi Central Deposit',
      addressLine1: 'Shekhar Bandhu Aushadhalaya',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      pincode: '221005'
    });
    warehouses = [defaultWarehouse];
    console.log(`🏭 Created Default Warehouse: ${defaultWarehouse.name}`);
  } else {
    console.log(`🏭 Found ${warehouses.length} warehouses`);
  }

  // 3. Seed inventory entries for each warehouse
  for (const wh of warehouses) {
    // InventoryEntry (finished goods entry with batch)
    const entry = await InventoryEntry.findOneAndUpdate(
      {
        warehouseId: wh._id,
        productId: product._id,
        packing: 1,
        batchNo: 'B-ABH2026'
      },
      {
        $set: {
          warehouseName: wh.name,
          productType: product.productType || '',
          size: product.size || '',
          hsnCode: product.hsnCode || '',
          qtyBoxes: 20, // 20 pcs
          packing: 1,
          batchNo: 'B-ABH2026'
        }
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded InventoryEntry in ${wh.name} (Qty: 20 pcs, Batch: B-ABH2026)`);

    // Inventory (legacy/consolidated entry)
    await Inventory.findOneAndUpdate(
      {
        warehouse: wh.name,
        itemSku: product.sku
      },
      {
        $set: {
          itemName: product.name,
          qty: 20,
          minReorder: 5,
          val: product.price
        }
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded Legacy Inventory in ${wh.name} (Qty: 20)`);
  }

  await mongoose.disconnect();
  console.log('✅ Seeding completed successfully');
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
