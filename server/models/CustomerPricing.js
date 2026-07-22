const mongoose = require('mongoose');

const customerPricingSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
}, { timestamps: true });

customerPricingSchema.index({ customerId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('CustomerPricing', customerPricingSchema);
