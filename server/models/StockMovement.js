const mongoose = require('mongoose');

const stockMovementItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true, trim: true },
  qty:         { type: Number, required: true },       // in boxes
  packing:     { type: Number, default: 1 },
  rate:        { type: Number, default: 0 },           // per box
  discountPercent: { type: Number, default: 0 },
  gstRate:     { type: Number, default: 0 },
  batchNo:     { type: String, default: '', trim: true },
  mfgDate:     { type: Date, default: null },
  expiryDate:  { type: Date, default: null },
  mrp:         { type: Number, default: 0 },
  hsnCode:     { type: String, default: '', trim: true },
  size:        { type: String, default: '', trim: true },
  purchaseRate:{ type: Number, default: 0 },
  manufacturingUnitId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ManufacturingUnit' },
  manufacturingUnitName: { type: String, default: '', trim: true }
}, { _id: false });

const stockMovementSchema = new mongoose.Schema({
  docNo:   { type: String, required: true, unique: true, trim: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  type: {
    type: String,
    enum: ['sale', 'sample', 'order', 'return', 'purchase', 'transfer_out', 'transfer_in', 'damage', 'production'],
    required: true
  },

  // Billing mode — only relevant for type:'sale'
  billingMode: { type: String, enum: ['cash', 'regular'], default: 'regular' },
  date:        { type: Date, default: Date.now },
  warehouseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseName: { type: String, default: '', trim: true },

  // Party
  partyType:  { type: String, enum: ['customer', 'mr', 'vendor', ''], default: '' },
  partyId:    { type: mongoose.Schema.Types.ObjectId },
  partyName:  { type: String, default: '', trim: true },
  partyGstin: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },

  // Items
  items: [stockMovementItemSchema],

  // Financial
  baseAmount:  { type: Number, default: 0 },
  totalMrp:    { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  cgst:        { type: Number, default: 0 },
  sgst:        { type: Number, default: 0 },
  igst:        { type: Number, default: 0 },
  roundOff:    { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  isFree:      { type: Boolean, default: false },

  // Status
  status: { type: String, enum: ['draft', 'dispatched', 'received', 'cancelled'], default: 'draft' },

  // Invoice link (for GST sales)
  convertedToInvoice: { type: Boolean, default: false },
  invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo:   { type: String, default: '', trim: true },

  // Reference to source doc (e.g. online order)
  sourceDocType: { type: String, default: '', trim: true },
  sourceDocId:   { type: mongoose.Schema.Types.ObjectId },

  // Doctor sampling fields
  medicalRepName: { type: String, default: '', trim: true },
  doctorName:     { type: String, default: '', trim: true },

  // Transport & Courier Logistics
  transporter: { type: String, default: '', trim: true },
  lrNo:        { type: String, default: '', trim: true },
  vehicleNo:   { type: String, default: '', trim: true },
  courierName: { type: String, default: '', trim: true },
  trackingId:  { type: String, default: '', trim: true },
  totalBoxes:  { type: String, default: '1', trim: true },

  // Damage write-off
  damageReason: { type: String, default: '', trim: true },

  // Notes
  notes:     { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true }
}, { timestamps: true });

stockMovementSchema.index({ docNo: 'text', partyName: 'text' });
stockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
