const mongoose = require('mongoose');

const dispatchSchema = new mongoose.Schema({
  dispatchNo:   { type: String, required: true, unique: true, trim: true },
  invoiceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo:    { type: String, default: '', trim: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone:{ type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  dispatchDate: { type: Date, default: Date.now },
  transporter:  { type: String, default: '', trim: true },
  lrNo:         { type: String, default: '', trim: true },          // Lorry Receipt / GR no.
  vehicleNo:    { type: String, default: '', trim: true },
  courierName:  { type: String, default: '', trim: true },
  trackingId:   { type: String, default: '', trim: true },
  trackingUrl:  { type: String, default: '', trim: true },
  totalBoxes:   { type: Number, default: 0 },
  totalWeight:  { type: String, default: '', trim: true },          // e.g. "12.5 kg"
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
