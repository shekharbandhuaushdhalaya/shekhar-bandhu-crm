require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product        = require('../models/Product');
const Warehouse      = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger    = require('../models/StockLedger');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Let's resolve Varanasi Central Depot and MUSTAKARISTA
  const product = await Product.findOne({ name: /mustakarista/i }).lean();
  const warehouse = await Warehouse.findOne({ name: /varanasi central/i }).lean();

  const testBatchNo = 'B-MUST-999-TEST';
  const testMfgDate = new Date('2026-07-01');
  const testExpiryDate = new Date('2028-07-01');

  // Delete any lingering test inventory entries for this batch
  await InventoryEntry.deleteMany({ batchNo: testBatchNo });
  await StockLedger.deleteMany({ batchNo: testBatchNo });

  console.log('Creating new stock entry with batch details...');
  
  // Call helper logic
  const payload = {
    warehouseId: warehouse._id.toString(),
    productId: product._id.toString(),
    qtyBoxes: 10,
    packing: 12,
    batchNo: testBatchNo,
    mfgDate: testMfgDate.toISOString(),
    expiryDate: testExpiryDate.toISOString(),
    note: 'Unit Test Batch Stock Intake',
    reference: 'DC-TEST-B1',
    createdBy: 'System Test'
  };

  // Find or create InventoryEntry
  let entry = await InventoryEntry.findOne({
    warehouseId: payload.warehouseId,
    productId: payload.productId,
    vendorId: '',
    packing: payload.packing,
    batchNo: testBatchNo
  });

  if (entry) {
    entry.qtyBoxes += payload.qtyBoxes;
  } else {
    entry = new InventoryEntry({
      warehouseId: payload.warehouseId,
      warehouseName: warehouse.name,
      productId: payload.productId,
      qtyBoxes: payload.qtyBoxes,
      packing: payload.packing,
      batchNo: testBatchNo,
      mfgDate: testMfgDate,
      expiryDate: testExpiryDate
    });
  }
  await entry.save();
  console.log('✅ InventoryEntry saved successfully:', entry._id);

  // Write StockLedger row
  const ledger = await StockLedger.create({
    productId: payload.productId,
    warehouseId: payload.warehouseId,
    warehouseName: warehouse.name,
    type: 'IN',
    qtyBoxes: payload.qtyBoxes,
    balanceBoxes: entry.qtyBoxes,
    reference: payload.reference,
    note: payload.note,
    createdBy: payload.createdBy,
    packing: payload.packing,
    batchNo: testBatchNo,
    mfgDate: testMfgDate,
    expiryDate: testExpiryDate
  });
  console.log('✅ StockLedger row saved successfully:', ledger._id);

  // Query it back
  const verifiedEntry = await InventoryEntry.findById(entry._id).lean();
  console.log('Verified fields:');
  console.log('- Batch:', verifiedEntry.batchNo);
  console.log('- Mfg Date:', verifiedEntry.mfgDate);
  console.log('- Expiry Date:', verifiedEntry.expiryDate);

  // Clean up
  await InventoryEntry.deleteOne({ _id: entry._id });
  await StockLedger.deleteOne({ _id: ledger._id });
  console.log('✅ Cleaned up successfully');

  await mongoose.disconnect();
}

main().catch(console.error);
