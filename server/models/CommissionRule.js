const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const slabSchema = new mongoose.Schema({ min: Number, max: Number, percent: Number }, { _id: false });
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  appliesTo: { type: String, enum: ['mr','salesperson','all'], default: 'all' },
  personId: { type: mongoose.Schema.Types.ObjectId, default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  percent: { type: Number, default: 0 },
  slabs: [slabSchema],
  basis: { type: String, enum: ['net_sales','collections'], default: 'net_sales' },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null }
}, { timestamps: true });
schema.index({ firmId: 1, active: 1, appliesTo: 1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('CommissionRule', schema);
