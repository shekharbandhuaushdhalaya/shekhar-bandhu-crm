require('dotenv').config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error('MONGODB_URI not found in environment');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(async () => {
    console.log('Connected to MongoDB Atlas');
    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    const BillOfMaterials = mongoose.model('BillOfMaterials', new mongoose.Schema({}, { strict: false }));
    
    // Find Chandanasava product
    const prod = await Product.findOne({ name: /chandanasava/i });
    if (!prod) {
      console.log('Product Chandanasava not found');
      process.exit(0);
    }
    console.log('Product Found:', { _id: prod._id, name: prod.name, productType: prod.productType, size: prod.size });
    
    // Find BOM
    const bom = await BillOfMaterials.findOne({ productId: prod._id });
    if (!bom) {
      console.log('BOM not found for product id:', prod._id);
      process.exit(0);
    }
    console.log('BOM Found:', JSON.stringify(bom, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
  });
