const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema({
  poItemId: { type: String, default: '' },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true, trim: true },
  qtyReceived: { type: Number, required: true, min: 1 },
  qtyAccepted: { type: Number, required: true, min: 0 },
  qtyRejected: { type: Number, default: 0, min: 0 },
  batchNo: { type: String, required: true, trim: true },
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
  items: [grnItemSchema],
  status: { type: String, enum: ['draft', 'verified', 'rejected'], default: 'verified' },
  notes: { type: String, default: '', trim: true },
  receivedBy: { type: String, default: 'System' }
}, { timestamps: true });

goodsReceivedNoteSchema.index({ grnNo: 'text', poNo: 'text', vendorName: 'text' });

module.exports = mongoose.model('GoodsReceivedNote', goodsReceivedNoteSchema);
