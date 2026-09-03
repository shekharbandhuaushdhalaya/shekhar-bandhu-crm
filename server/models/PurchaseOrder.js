const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true, trim: true },
  qtyOrdered: { type: Number, required: true, min: 1 },
  qtyReceived: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'kg' },
  hsnCode: { type: String, default: '', trim: true },
  gstRate: { type: Number, default: 0 }
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNo: { type: String, required: true, unique: true, trim: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true },
  orderDate: { type: Date, default: Date.now },
  expectedDeliveryDate: { type: Date },
  items: [poItemSchema],
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['draft', 'approved', 'partially_received', 'completed', 'cancelled'], 
    default: 'draft' 
  },
  notes: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

purchaseOrderSchema.index({ poNo: 'text', vendorName: 'text', status: 'text' });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
