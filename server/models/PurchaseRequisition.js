const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const itemSchema = new mongoose.Schema({
  itemType: { type: String, enum: ['raw_material', 'finished_product'], required: true },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true, trim: true },
  qtyRequested: { type: Number, required: true, min: 0.0001 },
  unit: { type: String, required: true, trim: true },
  estimatedUnitPrice: { type: Number, default: null, min: 0 },
  notes: { type: String, default: '', trim: true }
}, { _id: true });

const schema = new mongoose.Schema({
  requisitionNo: { type: String, required: true, unique: true, trim: true },
  requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByName: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  requiredByDate: { type: Date, default: null },
  justification: { type: String, required: true, trim: true },
  items: { type: [itemSchema], validate: v => Array.isArray(v) && v.length > 0 },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled'], default: 'draft', index: true },
  submittedAt: { type: Date, default: null },
  approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  rejectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedByName: { type: String, default: '' },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  selectedQuotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierQuotation', default: null },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });
schema.index({ requestedByUserId: 1, createdAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('PurchaseRequisition', schema);
