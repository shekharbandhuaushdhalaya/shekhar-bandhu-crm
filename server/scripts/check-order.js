const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Order = require('../models/Order');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');
  const order = await Order.findById('6a5389576ae33da092fd5789').lean();
  console.log('📦 Order Data:', JSON.stringify(order, null, 2));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
