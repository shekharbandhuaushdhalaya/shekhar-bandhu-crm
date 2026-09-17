const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  size: { type: String, default: '' },
  deductedBoxes: { type: Number, default: 0 },
  fulfilledQty: { type: Number, default: 0, min: 0 },
  backorderedQty: { type: Number, default: 0, min: 0 },
  freeQty: { type: Number, default: 0, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  pricingSource: { type: String, default: '' },
  schemeCode: { type: String, default: '' }
});

const orderSchema = new mongoose.Schema({
  orderNo: { type: String, default: '', trim: true },
  clientOrderRef: { type: String, default: '', trim: true },
  orderChannel: { type: String, enum: ['crm','portal','website','phone','mr','other'], default: 'crm' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  shippingAddress: { type: String, required: true, trim: true },
  billingAddress: { type: String, default: '', trim: true },
  customerPoNo: { type: String, default: '', trim: true },
  expectedDeliveryDate: { type: Date, default: null },
  priority: { type: String, enum: ['low','normal','high','urgent'], default: 'normal' },
  paymentTerms: { type: String, default: '', trim: true },
  creditDays: { type: Number, default: 0, min: 0 },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  warehouseName: { type: String, default: '' },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['draft','pending', 'processing', 'partially_fulfilled', 'fulfilled', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  sourceType: { type: String, enum: ['direct','mr','salesperson','distributor','online','referral','existing_customer'], default: 'direct' },
  sourcePersonId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourcePersonName: { type: String, default: '' },
  pricingSummary: { subtotal: { type: Number, default: 0 }, discount: { type: Number, default: 0 }, schemeBenefit: { type: Number, default: 0 } },
  challanIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Challan' }],
  invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }],
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  mrName: { type: String, default: '', trim: true },
  visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'MrVisit', default: null },
  commissionAmount: { type: Number, default: 0, min: 0 },
  incentiveCredited: { type: Boolean, default: false },
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
orderSchema.index({ firmId: 1, orderNo: 1 }, { unique: true, sparse: true });
orderSchema.index({ firmId: 1, customerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ firmId: 1, clientOrderRef: 1 }, { unique: true, sparse: true, partialFilterExpression: { clientOrderRef: { $type: 'string', $ne: '' } } });
orderSchema.index({ firmId: 1, status: 1 });
orderSchema.index({ firmId: 1, totalAmount: 1 });

orderSchema.plugin(tenantPlugin);
module.exports = mongoose.model('Order', orderSchema);
