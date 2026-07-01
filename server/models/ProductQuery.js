const mongoose = require('mongoose');

const productQuerySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  productName: { type: String, required: true, trim: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  query: { type: String, required: true, trim: true },
  image: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'contacted', 'converted', 'closed'],
    default: 'pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('ProductQuery', productQuerySchema);
