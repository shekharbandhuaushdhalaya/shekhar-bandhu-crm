const mongoose = require('mongoose');

const dispatchItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 },
  packing: { type: Number, default: 1 },
  batchNo: { type: String, default: '', trim: true },
  inventoryEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryEntry' },
}, { _id: false });

const dispatchSchema = new mongoose.Schema({
  dispatchNo:   { type: String, required: true, unique: true, trim: true },
  invoiceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo:    { type: String, default: '', trim: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone:{ type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  dispatchDate: { type: Date, default: Date.now },
  transporter:  { type: String, default: '', trim: true },
  lrNo:         { type: String, default: '', trim: true },
  vehicleNo:    { type: String, default: '', trim: true },
  courierName:  { type: String, default: '', trim: true },
  trackingId:   { type: String, default: '', trim: true },
  trackingUrl:  { type: String, default: '', trim: true },
  items:        { type: [dispatchItemSchema], default: [] },
  totalBoxes:   { type: Number, default: 0 },
  totalWeight:  { type: String, default: '', trim: true },
  freightCharge:{ type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned'],
    default: 'dispatched'
  },
  deliveredAt:  { type: Date },
  notes:        { type: String, default: '', trim: true },
}, { timestamps: true });

dispatchSchema.index({ createdAt: -1 });
dispatchSchema.index({ status: 1 });
dispatchSchema.index({ invoiceId: 1 });

module.exports = mongoose.model('Dispatch', dispatchSchema);
