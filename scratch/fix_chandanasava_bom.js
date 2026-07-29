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
    
    // Update BOM
    const result = await BillOfMaterials.updateOne(
      { productId: prod._id },
      { 
        $set: { 
          formulationBasis: 450, 
          formulationBasisUnit: 'ml' 
        } 
      }
    );
    console.log('Update result:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
  });
