require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product        = require('../models/Product');
const Warehouse      = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger    = require('../models/StockLedger');
const Order          = require('../models/Order');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Let's find MUSTAKARISTA
  const product = await Product.findOne({ name: /mustakarista/i }).lean();
  const warehouse = await Warehouse.findOne({ name: /varanasi central/i }).lean();
  console.log('Product MUSTAKARISTA ID:', product._id);
  console.log('Warehouse ID:', warehouse._id);

  // Check current stock levels
  const entriesBefore = await InventoryEntry.find({ warehouseId: warehouse._id, productId: product._id }).lean();
  const totalBefore = entriesBefore.reduce((acc, entry) => acc + (entry.qtyBoxes * entry.packing), 0);
  console.log('Stock BEFORE test:', totalBefore, 'units across', entriesBefore.length, 'entries');

  // Simulate a request to public/create
  const requestBody = {
    name: "Test User",
    email: "test@test.com",
    phone: "9999999999",
    shippingAddress: "Lanka, Varanasi",
    items: [
      {
        productId: product._id.toString(),
        qty: 5,
        name: product.name
      }
    ]
  };

  // Run the logic from server/routes/orders.js
  let totalAmount = 0;
  const validatedItems = [];

  for (const item of requestBody.items) {
    const dbProd = await Product.findById(item.productId);
    const qty = parseInt(item.qty, 10);
    const price = dbProd.price;

    const entries = await InventoryEntry.find({
      warehouseId: warehouse._id,
      productId: dbProd._id
    });
    const totalAvailable = entries.reduce((acc, entry) => acc + ((entry.qtyBoxes || 0) * (entry.packing || 1)), 0);

    if (totalAvailable < qty) {
      throw new Error(`Insufficient stock. Available: ${totalAvailable}`);
    }

    totalAmount += price * qty;
    validatedItems.push({
      productId: dbProd._id,
      name: dbProd.name,
      qty: qty,
      price: Number(price.toFixed(2)),
      size: dbProd.size || 'Standard'
    });

    dbProd.stockLevel = Math.max(0, dbProd.stockLevel - qty);
    await dbProd.save();

    let qtyNeeded = qty;
    for (const entry of entries) {
      if (qtyNeeded <= 0) break;
      const entryUnits = (entry.qtyBoxes || 0) * (entry.packing || 1);
      if (entryUnits <= 0) continue;

      const deductUnits = Math.min(qtyNeeded, entryUnits);
      const deductBoxes = deductUnits / (entry.packing || 1);

      const entryDoc = await InventoryEntry.findById(entry._id);
      entryDoc.qtyBoxes = Math.max(0, entryDoc.qtyBoxes - deductBoxes);
      await entryDoc.save();

      await StockLedger.create({
        productId: dbProd._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'OUT',
        qtyBoxes: -deductBoxes,
        balanceBoxes: entryDoc.qtyBoxes,
        reference: `Web Order (Test)`,
        note: `Auto-deducted via Web Order (Test) for ${requestBody.name}`,
        createdBy: 'System',
        packing: entry.packing || 1,
        vendorId: entry.vendorId || '',
        vendorName: entry.vendorName || '',
      });

      qtyNeeded -= deductUnits;
    }
  }

  // Check stock levels AFTER
  const entriesAfter = await InventoryEntry.find({ warehouseId: warehouse._id, productId: product._id }).lean();
  const totalAfter = entriesAfter.reduce((acc, entry) => acc + (entry.qtyBoxes * entry.packing), 0);
  console.log('Stock AFTER test:', totalAfter, 'units');
  console.log('Difference (Expected 5):', totalBefore - totalAfter);

  // Query latest stock ledger entry
  const latestLedger = await StockLedger.findOne({ reference: 'Web Order (Test)' }).sort({ createdAt: -1 }).lean();
  console.log('Ledger row created:', latestLedger ? 'YES' : 'NO', '| type:', latestLedger?.type, '| qtyBoxes:', latestLedger?.qtyBoxes);

  // Cleanup: restore the deducted stock
  console.log('Restoring test stock levels...');
  for (const entry of entriesAfter) {
    const orig = entriesBefore.find(e => e._id.toString() === entry._id.toString());
    if (orig) {
      const doc = await InventoryEntry.findById(entry._id);
      doc.qtyBoxes = orig.qtyBoxes;
      await doc.save();
    }
  }
  const prodDoc = await Product.findById(product._id);
  prodDoc.stockLevel = product.stockLevel;
  await prodDoc.save();

  // Delete the stock ledger entry
  if (latestLedger) {
    await StockLedger.deleteOne({ _id: latestLedger._id });
  }

  console.log('✅ Restoration complete');
  await mongoose.disconnect();
}

main().catch(console.error);
