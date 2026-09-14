/**
 * Script to fix double-counted customer balances due to converted delivery challans.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const Customer = require('../models/Customer');
  const Invoice = require('../models/Invoice');

  const customers = await Customer.find({});
  console.log(`Found ${customers.length} customers. Checking for double counting...`);

  for (const cust of customers) {
    const names = [cust.name, cust.company].filter(Boolean);
    if (names.length === 0) continue;

    // Find all finalized sale invoices converted from delivery challans for this customer.
    // An invoice is converted from a challan if it has sourceDocId or reference, or isConvertedFromChallan indicator.
    // Note: in our new code, we set reference/sourceDocId on conversion.
    // Let's search for invoices that have sourceDocId set, are of type 'sale', and are finalized.
    const doubleCountedInvoices = await Invoice.find({
      customerName: { $in: names },
      type: 'sale',
      isFinalized: true,
      $or: [
        { sourceDocId: { $ne: null } },
        { reference: { $ne: '' } }
      ]
    });

    if (doubleCountedInvoices.length > 0) {
      let regularDeduction = 0;
      let cashDeduction = 0;

      for (const inv of doubleCountedInvoices) {
        if (inv.mode === 'cash') {
          cashDeduction += inv.amount;
        } else {
          regularDeduction += inv.amount;
        }
      }

      if (regularDeduction > 0 || cashDeduction > 0) {
        console.log(`\n👤 Customer: ${cust.company || cust.name}`);
        console.log(`  Current Regular Balance: ₹${cust.regularBalance}`);
        console.log(`  Current Cash Balance:    ₹${cust.cashBalance}`);
        console.log(`  Found ${doubleCountedInvoices.length} converted finalized invoices:`);
        doubleCountedInvoices.forEach(inv => {
          console.log(`    - Inv ${inv.invoiceNo}: ₹${inv.amount} (${inv.mode})`);
        });
        
        const oldRegular = cust.regularBalance;
        const oldCash = cust.cashBalance;

        cust.regularBalance = Math.max(0, cust.regularBalance - regularDeduction);
        cust.cashBalance = Math.max(0, cust.cashBalance - cashDeduction);

        console.log(`  -> Corrected Regular Balance: ₹${cust.regularBalance} (Reduced by ₹${regularDeduction})`);
        console.log(`  -> Corrected Cash Balance:    ₹${cust.cashBalance} (Reduced by ₹${cashDeduction})`);

        await cust.save();
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Recalculation and database balance adjustment complete.');
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
