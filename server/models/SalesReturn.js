const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  batchNo: { type: String, default: '' },
  qty: { type: Number, required: true, min: 0.0001 },
  packing: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  condition: { type: String, enum: ['saleable','damaged','expired','other'], default: 'saleable' },
  reason: { type: String, default: '' }
}, { _id: false });
const schema = new mongoose.Schema({
  returnNo: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  invoiceNo: { type: String, default: '' },
  challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan', default: null },
  challanNo: { type: String, default: '' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  status: { type: String, enum: ['draft','posted','cancelled'], default: 'draft' },
  resolution: { type: String, enum: ['credit_note','refund','replacement','none'], default: 'credit_note' },
  items: [itemSchema],
  totalAmount: { type: Number, default: 0 },
  postedAt: { type: Date, default: null },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });
schema.index({ firmId: 1, returnNo: 1 }, { unique: true });
schema.index({ firmId: 1, customerId: 1, createdAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('SalesReturn', schema);
