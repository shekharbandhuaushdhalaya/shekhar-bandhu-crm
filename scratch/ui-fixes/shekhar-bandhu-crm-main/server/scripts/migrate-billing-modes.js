/**
 * Migration: Rename kachha/pakka billing modes and balances to cash/regular
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // 1. Rename fields in Customer
  const custRename = await db.collection('customers').updateMany(
    {},
    { 
      $rename: { 
        kachhaBalance: 'cashBalance', 
        pakkaBalance: 'regularBalance' 
      } 
    }
  );
  console.log(`✅ Customer: Renamed balance fields in ${custRename.modifiedCount} docs`);

  // 2. Rename fields in Vendor
  const vendRename = await db.collection('vendors').updateMany(
    {},
    { 
      $rename: { 
        kachhaBalance: 'cashBalance', 
        pakkaBalance: 'regularBalance' 
      } 
    }
  );
  console.log(`✅ Vendor: Renamed balance fields in ${vendRename.modifiedCount} docs`);

  // 3. Update stockmovements.billingMode
  const smCash = await db.collection('stockmovements').updateMany(
    { billingMode: 'kaccha' },
    { $set: { billingMode: 'cash' } }
  );
  const smRegular = await db.collection('stockmovements').updateMany(
    { billingMode: 'pakka' },
    { $set: { billingMode: 'regular' } }
  );
  console.log(`✅ StockMovement: Updated modes in ${smCash.modifiedCount + smRegular.modifiedCount} docs`);

  // 4. Update invoices.mode
  const invCash = await db.collection('invoices').updateMany(
    { mode: 'kachha' },
    { $set: { mode: 'cash' } }
  );
  const invRegular = await db.collection('invoices').updateMany(
    { mode: 'pakka' },
    { $set: { mode: 'regular' } }
  );
  console.log(`✅ Invoice: Updated modes in ${invCash.modifiedCount + invRegular.modifiedCount} docs`);

  // 5. Update payments.mode
  const payCash = await db.collection('payments').updateMany(
    { mode: 'kachha' },
    { $set: { mode: 'cash' } }
  );
  const payRegular = await db.collection('payments').updateMany(
    { mode: 'pakka' },
    { $set: { mode: 'regular' } }
  );
  console.log(`✅ Payment: Updated modes in ${payCash.modifiedCount + payRegular.modifiedCount} docs`);

  // 6. Update ledgerentries.mode
  const ledgerCash = await db.collection('ledgerentries').updateMany(
    { mode: 'kaccha' },
    { $set: { mode: 'cash' } }
  );
  const ledgerRegular = await db.collection('ledgerentries').updateMany(
    { mode: 'pakka' },
    { $set: { mode: 'regular' } }
  );
  console.log(`✅ LedgerEntry: Updated modes in ${ledgerCash.modifiedCount + ledgerRegular.modifiedCount} docs`);

  // 7. Update quotations.mode
  const quoteRegular = await db.collection('quotations').updateMany(
    { mode: 'pakka' },
    { $set: { mode: 'regular' } }
  );
  console.log(`✅ Quotation: Updated modes in ${quoteRegular.modifiedCount} docs`);

  // 8. Update challans.mode
  const challanRegular = await db.collection('challans').updateMany(
    { mode: 'pakka' },
    { $set: { mode: 'regular' } }
  );
  console.log(`✅ Challan: Updated modes in ${challanRegular.modifiedCount} docs`);

  await mongoose.disconnect();
  console.log('✅ Migration complete');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
