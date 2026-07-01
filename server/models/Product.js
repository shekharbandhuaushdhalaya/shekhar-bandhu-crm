const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  price: { type: Number, default: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },   // % discount to display on website
  discountLabel: { type: String, default: '', trim: true },    // e.g. "Festive Offer", "Bulk Deal"
  websitePromoActive: { type: Boolean, default: false },       // master toggle for promo banner
  stockLevel: { type: Number, default: 0 },
  category: { type: String, default: 'General' },
  minReorder: { type: Number, default: 5 },
  hsnCode: { type: String, required: true, default: '70109000', trim: true },
  gstRate: { type: Number, default: 18 },
  productType: { type: String, default: '' },
  size: { type: String, default: '' },
  colour: { type: String, default: '' },
  shape: { type: String, default: '' },
  weight: { type: String, default: '' },
  vendorId: { type: String, default: '' },
  vendorName: { type: String, default: '' },
  image: { type: String, default: '' },
  description: { type: String, default: '' },
  disease: { type: String, default: '' }
}, { timestamps: true });

productSchema.index({ name: 'text', sku: 'text', category: 'text' });
productSchema.index({ productType: 1, size: 1, colour: 1, shape: 1, weight: 1 }, { collation: { locale: 'en', strength: 2 } });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
