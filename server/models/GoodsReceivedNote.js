const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const grnItemSchema = new mongoose.Schema({
  poItemId: { type: String, default: '' },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true, trim: true },
  qtyReceived: { type: Number, required: true, min: 1 },
  qtyAccepted: { type: Number, required: true, min: 0 },
  qtyRejected: { type: Number, default: 0, min: 0 },
  batchNo: { type: String, required: true, trim: true },
  supplierCoaRef: { type: String, default: '', trim: true },
  mfgDate: { type: Date },
  expiryDate: { type: Date },
  rejectionReason: { type: String, default: '', trim: true }
}, { _id: false });

const goodsReceivedNoteSchema = new mongoose.Schema({
  grnNo: { type: String, required: true, unique: true, trim: true },
  poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
  poNo: { type: String, required: true, trim: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  receivedDate: { type: Date, default: Date.now },
  gateEntryNo: { type: String, default: '', trim: true },
  vehicleNo: { type: String, default: '', trim: true },
  driverName: { type: String, default: '', trim: true },
  transporterName: { type: String, default: '', trim: true },
  eWayBillNo: { type: String, default: '', trim: true },
  gateInAt: { type: Date, default: null },
  grossWeight: { type: Number, min: 0, default: null },
  tareWeight: { type: Number, min: 0, default: null },
  netWeight: { type: Number, min: 0, default: null },
  weightUnit: { type: String, enum: ['kg', 'g', 'mt'], default: 'kg' },
  weighmentSlipRef: { type: String, default: '', trim: true },
  items: [grnItemSchema],
  status: { type: String, enum: ['draft', 'pending_verification', 'verified', 'rejected'], default: 'pending_verification' },
  receivedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedByName: { type: String, default: '', trim: true },
  verifiedAt: { type: Date, default: null },
  verificationNotes: { type: String, default: '', trim: true },
  rejectionReason: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  receivedBy: { type: String, default: 'System' }
}, { timestamps: true });

goodsReceivedNoteSchema.index({ grnNo: 'text', poNo: 'text', vendorName: 'text' });

goodsReceivedNoteSchema.plugin(tenantPlugin);
module.exports = mongoose.model('GoodsReceivedNote', goodsReceivedNoteSchema);
