const mongoose = require('mongoose');

const challanItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 }, // quantity in boxes
  rate: { type: Number, default: 0 },
  packing: { type: Number, default: 1 },
  hsnCode: { type: String, default: '' },
  gstRate: { type: Number, default: 0 },
  vendorId: { type: String, default: '', trim: true },
  vendorName: { type: String, default: '', trim: true }
}, { _id: false });

const challanSchema = new mongoose.Schema({
  challanNo: { type: String, required: true, unique: true, trim: true },
  date: { type: Date, default: Date.now },
  partyName: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },
  partyCity: { type: String, default: '', trim: true },
  stateOfSupply: { type: String, default: '', trim: true },
  gstin: { type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseName: { type: String, default: '', trim: true },
  items: [challanItemSchema],
  status: { type: String, default: 'draft' },
  mode: { type: String, enum: ['pakka', 'kachha'], default: 'pakka' },
  baseAmount: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  nettTotal: { type: Number, default: 0 },
  convertedToInvoice: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo: { type: String, default: '' },
  deductInventory: { type: Boolean, default: true }
}, { timestamps: true });

challanSchema.index({ challanNo: 'text', partyName: 'text', status: 'text' });
challanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Challan', challanSchema);
