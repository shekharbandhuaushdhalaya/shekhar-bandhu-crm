const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  mrIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative' }],
  territory: { type: String, default: '' },
  targetCalls: { type: Number, default: 0, min: 0 },
  targetOrders: { type: Number, default: 0, min: 0 },
  targetSales: { type: Number, default: 0, min: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' }
}, { timestamps: true });
schema.index({ firmId: 1, active: 1, validFrom: 1, validUntil: 1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('FocusProduct', schema);
