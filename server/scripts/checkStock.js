require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product        = require('../models/Product');
const Warehouse      = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const warehouse = await Warehouse.findOne({ name: /varanasi central/i }).lean();
  console.log('Warehouse:', warehouse?.name, warehouse?._id);

  const product = await Product.findOne({ name: /abhayarishta/i }).lean();
  console.log('\nProduct:', product?.name, product?._id, '| stockLevel:', product?.stockLevel);

  const entries = await InventoryEntry.find({ productId: product?._id }).lean();
  console.log('\nInventoryEntries for ABHAYARISHTA:');
  entries.forEach(e => console.log(' -', 'warehouseId:', e.warehouseId, '| qtyBoxes:', e.qtyBoxes));

  // Simulate what the server endpoint does
  const entries2 = await InventoryEntry.find({ warehouseId: warehouse?._id }).lean();
  let stockMap = {};
  for (const e of entries2) {
    const pid = e.productId.toString();
    stockMap[pid] = (stockMap[pid] || 0) + (e.qtyBoxes || 0);
  }
  console.log('\nStock from map for ABHAYARISHTA:', stockMap[product?._id?.toString()]);

  await mongoose.disconnect();
}
main().catch(console.error);
