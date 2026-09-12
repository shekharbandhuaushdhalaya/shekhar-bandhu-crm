const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const schema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  requestedQty: { type: Number, required: true, min: 0 },
  estimatedValue: { type: Number, default: 0, min: 0 },
  reason: { type: String, enum: ['out_of_stock','price','competitor','delivery_time','customer_cancelled','other'], required: true },
  notes: { type: String, default: '' },
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  source: { type: String, enum: ['sales','mr','website','phone','other'], default: 'sales' },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ firmId: 1, occurredAt: -1, reason: 1 });
schema.index({ firmId: 1, productId: 1, occurredAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('LostSale', schema);
