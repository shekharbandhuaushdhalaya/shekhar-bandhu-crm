const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const itemSchema = new mongoose.Schema({
  itemType: { type: String, enum: ['raw_material', 'finished_product'], required: true },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true, trim: true },
  qtyQuoted: { type: Number, required: true, min: 0.0001 },
  unit: { type: String, required: true, trim: true },
  unitPrice: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  lineBase: { type: Number, required: true, min: 0 },
  lineTax: { type: Number, required: true, min: 0 }
}, { _id: false });

const schema = new mongoose.Schema({
  quotationNo: { type: String, required: true, unique: true, trim: true },
  requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequisition', required: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true },
  vendorQuoteReference: { type: String, required: true, trim: true },
  quoteDate: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  items: { type: [itemSchema], validate: v => Array.isArray(v) && v.length > 0 },
  subtotal: { type: Number, required: true, min: 0 },
  taxAmount: { type: Number, required: true, min: 0 },
  freightAmount: { type: Number, default: 0, min: 0 },
  otherCharges: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  deliveryLeadTimeDays: { type: Number, required: true, min: 0 },
  paymentTerms: { type: String, default: '', trim: true },
  evidenceRef: { type: String, required: true, trim: true },
  notes: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending_review', 'selected', 'rejected', 'expired', 'converted'], default: 'pending_review', index: true },
  submittedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedByName: { type: String, required: true, trim: true },
  reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: '', trim: true },
  rejectionReason: { type: String, default: '', trim: true }
}, { timestamps: true });

schema.index({ requisitionId: 1, vendorId: 1, status: 1 });
schema.index({ requisitionId: 1, totalAmount: 1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('SupplierQuotation', schema);
