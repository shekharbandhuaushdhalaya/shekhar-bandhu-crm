const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' },
  name: { type: String, required: true },
  unit: { type: String, default: '' },
  mrp: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  qty: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Quantity cannot be negative']
  },
  boxes: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Boxes cannot be negative']
  },
  packing: { 
    type: Number, 
    required: true, 
    default: 1,
    min: [1, 'Packing must be at least 1']
  },
  rate: { 
    type: Number, 
    required: true, 
    default: 0,
    min: [0, 'Rate cannot be negative']
  },
  hsnCode: { type: String, default: '' },
  gstRate: { 
    type: Number, 
    default: 0,
    min: [0, 'GST rate cannot be negative'],
    max: [100, 'GST rate cannot exceed 100%']
  }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true, trim: true },
  firmDetails: {
    name: { type: String },
    address: { type: String },
    email: { type: String },
    phone: { type: String },
    gstin: { type: String },
    bankName: { type: String },
    bankAccountNo: { type: String },
    bankIfsc: { type: String },
    bankBranch: { type: String }
  },
  customerName: { type: String, default: '', trim: true },
  supplierName: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, default: 0, min: [0, 'Amount cannot be negative'] },
  dueDate: { type: Date },
  status: { type: String, default: 'unpaid' },
  amountPaid: { type: Number, default: 0, min: [0, 'Amount paid cannot be negative'] },
  mode: { type: String, enum: ['regular', 'cash'], default: 'regular' },
  baseAmount: { type: Number },
  totalMrp: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
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
  saleType: { type: String, enum: ['b2b', 'b2c_physical', 'b2c_website', 'doctor_sampling', 'damage'], default: 'b2b' },
  websiteOrderRef: { type: String, default: '', trim: true },
  medicalRepName: { type: String, default: '', trim: true },
  doctorName: { type: String, default: '', trim: true },
  damageReason: { type: String, default: '', trim: true },
  items: [invoiceItemSchema]
}, { timestamps: true });

invoiceSchema.index({ invoiceNo: 'text', customerName: 'text', supplierName: 'text', status: 'text' });
invoiceSchema.index({ createdAt: -1 });
// Compound indexes for date-range report queries and aging filter
invoiceSchema.index({ type: 1, date: -1 });
invoiceSchema.index({ type: 1, isFinalized: 1, status: 1 });
invoiceSchema.index({ isFinalized: 1, status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
