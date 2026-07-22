const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Product = require('../models/Product');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');
  const product = await Product.findById('6a495a5798d83124b3e2d73f').lean();
  console.log('📦 Product Data:', JSON.stringify(product, null, 2));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
