const mongoose = require('mongoose');

const quotationItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 },
  boxes: { type: Number, required: true, default: 0 },
  packing: { type: Number, required: true, default: 1 },
  rate: { type: Number, required: true, default: 0 },
  hsnCode: { type: String, default: '' },
  gstRate: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  batchNo: { type: String, default: '' },
  expiryDate: { type: Date }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotationNo: { type: String, required: true, unique: true, trim: true },
  customerName: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, default: 0 },
  status: { type: String, default: 'draft', enum: ['draft', 'sent', 'approved', 'rejected'] },
  mode: { type: String, enum: ['regular', 'pakka', 'cash'], default: 'pakka' },
  baseAmount: { type: Number },
  gstRate: { type: Number },
  cgst: { type: Number },
  sgst: { type: Number },
  igst: { type: Number },
  roundOff: { type: Number, default: 0 },
  freightAmount: { type: Number, default: 0 },
  stateOfSupply: { type: String, default: '' },
  gstin: { type: String, default: '', trim: true },
  items: [quotationItemSchema],
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseName: { type: String, default: '', trim: true },
  isFinalized: { type: Boolean, default: false },
  convertedToInvoice: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo: { type: String, default: '' }
}, { timestamps: true });

quotationSchema.index({ quotationNo: 'text', customerName: 'text', status: 'text' });
quotationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);
