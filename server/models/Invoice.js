const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 },
  boxes: { type: Number, required: true, default: 0 },
  packing: { type: Number, required: true, default: 1 },
  rate: { type: Number, required: true, default: 0 },
  hsnCode: { type: String, default: '' },
  gstRate: { type: Number, default: 0 },
  batchNo: { type: String, default: '', trim: true }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true, trim: true },
  customerName: { type: String, default: '', trim: true },
  supplierName: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, default: 0 },
  dueDate: { type: Date },
  status: { type: String, default: 'unpaid' },
  mode: { type: String, enum: ['pakka'], default: 'pakka' },
  baseAmount: { type: Number },
  gstRate: { type: Number },
  cgst: { type: Number },
  sgst: { type: Number },
  igst: { type: Number },
  roundOff: { type: Number, default: 0 },
  freightAmount: { type: Number, default: 0 },
  internalFreightExpense: { type: Number, default: 0 },
  stateOfSupply: { type: String, default: '' },
  gstin: { type: String, default: '', trim: true },
  ewayBillNo: { type: String, default: '', trim: true },
  vehicleNo: { type: String, default: '', trim: true },
  transport: { type: String, default: '', trim: true },
  irn: { type: String, default: '', trim: true },
  type: { type: String, enum: ['sale', 'purchase'], required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseName: { type: String, default: '', trim: true },
  deductInventory: { type: Boolean, default: false },
  isFinalized: { type: Boolean, default: false },
  agentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentName: { type: String, default: '', trim: true },
  items: [invoiceItemSchema],
  paymentTransactionId: { type: String, default: '' },
  paymentGatewayData: { type: mongoose.Schema.Types.Mixed, default: null },
  cartageAmount: { type: Number, default: 0 },
  subTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  partyGstin: { type: String, default: '', trim: true },
  qrCode: { type: String, default: '' },
  reference: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true });

invoiceSchema.index({ invoiceNo: 'text', customerName: 'text', supplierName: 'text', status: 'text' });
invoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
