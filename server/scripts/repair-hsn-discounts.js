require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shekhar-bandhu-crm';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  const invoices = await Invoice.find({});
  console.log(`Found ${invoices.length} invoices to check.`);

  let updatedCount = 0;
  for (const invoice of invoices) {
    let updated = false;
    
    // Attempt to pull referenced StockMovement if converted from Challan
    let movement = null;
    if (invoice.reference || invoice.sourceDocId) {
      const refId = invoice.reference || invoice.sourceDocId;
      try {
        movement = await StockMovement.findById(refId).lean();
      } catch (e) {}
    }

    for (let it of invoice.items) {
      // 1. Repair HSN code
      if (!it.hsnCode && it.productId) {
        const product = await Product.findById(it.productId).lean();
        if (product && product.hsnCode) {
          it.hsnCode = product.hsnCode;
          updated = true;
        }
      }

      // 2. Repair MRP and Discount from StockMovement or Product
      if (movement && movement.items) {
        const matchingSmItem = movement.items.find(sm => sm.productId?.toString() === it.productId?.toString());
        if (matchingSmItem) {
          if (matchingSmItem.mrp && (!it.mrp || it.mrp === it.rate)) {
            it.mrp = matchingSmItem.mrp;
            updated = true;
          }
          if (matchingSmItem.discountPercent && !it.discountPercent) {
            it.discountPercent = matchingSmItem.discountPercent;
            updated = true;
          }
        }
      }
      
      // Fallback: If MRP is still missing/0, use product MRP
      if ((!it.mrp || it.mrp === 0 || it.mrp === it.rate) && it.productId) {
        const product = await Product.findById(it.productId).lean();
        if (product && product.mrp) {
          it.mrp = product.mrp;
          updated = true;
          // Calculate discount percent if MRP > rate
          if (product.mrp > it.rate) {
            const computedDisc = ((product.mrp - it.rate) / product.mrp) * 100;
            it.discountPercent = parseFloat(computedDisc.toFixed(1));
          }
        }
      }
    }

    if (updated) {
      await Invoice.findByIdAndUpdate(invoice._id, { items: invoice.items });
      console.log(`Updated invoice: ${invoice.invoiceNo}`);
      updatedCount++;
    }
  }

  console.log(`Migration finished successfully! Updated ${updatedCount} invoices.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Error running repair script:', err);
  process.exit(1);
});
