const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  size: { type: String, default: '' },
  deductedBoxes: { type: Number, default: 0 }
});

const orderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  shippingAddress: { type: String, required: true, trim: true },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  courierName: { type: String, default: '', trim: true },
  trackingId: { type: String, default: '', trim: true },
  courierLink: { type: String, default: '', trim: true },
  adminNotes: { type: String, default: '', trim: true },
  notifications: [{ type: String }],
  approvalStatus: {
    type: String,
    enum: ['none', 'pending_approval', 'approved', 'rejected'],
    default: 'none'
  },
  approvalRequired: { type: Boolean, default: false },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' }
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
