const mongoose = require('mongoose');

const volumeTierSchema = new mongoose.Schema({
  minQty: { type: Number, required: true, min: 1 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  fixedRate: { type: Number, default: null, min: 0 }
}, { _id: false });

const customerPricingSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', default: null },
  customRate: { type: Number, default: null, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  volumeTiers: [volumeTierSchema],
  validUntil: { type: Date, default: null }
}, { timestamps: true });

customerPricingSchema.index({ customerId: 1, productId: 1 }, { sparse: true });
customerPricingSchema.index({ customerId: 1, rawMaterialId: 1 }, { sparse: true });

module.exports = mongoose.model('CustomerPricing', customerPricingSchema);
