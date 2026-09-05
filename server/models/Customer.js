const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '', trim: true },
  email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  passwordHash: { type: String, default: null },
  portalEnabled: { type: Boolean, default: false },
  phone: { type: String, default: '' },
  regularBalance: { type: Number, default: 0 },
  cashBalance: { type: Number, default: 0 },
  outstandingInvoices: { type: Number, default: 0 },
  salesVolume: { type: Number, default: 0 },
  gstin: { type: String, default: '', trim: true },
  state: { type: String, default: 'Maharashtra', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  pan: { type: String, default: '', trim: true },
  placeOfSupply: { type: String, default: '', trim: true },
  paymentTerms: { type: String, default: 'Net 30', trim: true },
  billingAddress: {
    street: { type: String, default: '', trim: true },
    pin: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true }
  },
  shippingAddress: {
    street: { type: String, default: '', trim: true },
    pin: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true }
  },
  shippingSameAsBilling: { type: Boolean, default: false },
  customerType: { type: String, enum: ['gst', 'cash'], default: 'gst' },
  recordTracking: { type: String, enum: ['invoice_ledger', 'cash_ledger'], default: 'invoice_ledger' },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  drugLicenseNo: { type: String, default: '', trim: true },
  drugLicenseExpiry: { type: Date, default: null },
  latitude: { type: Number },
  longitude: { type: Number },
  category: { type: String, enum: ['A', 'B', 'C', ''], default: '' },
  specialty: { type: String, default: '', trim: true },
  birthday: { type: Date, default: null },
  anniversary: { type: Date, default: null },
  preferredTime: { type: String, default: '', trim: true },
  assignedMrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  areaName: { type: String, default: '', trim: true },
  preferredVisitDay: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', ''],
    default: ''
  },
  creditLimit: { type: Number, default: 0 },  // 0 = unlimited
  tags: [{ type: String, trim: true }],
  volumeTier: { type: String, enum: ['tier_1', 'tier_2', 'tier_3', 'none'], default: 'none' },
  monthlySampleQuota: { type: Number, default: null }, // Monthly max sample units allowed (falls back to category default if null)
}, { timestamps: true });

customerSchema.index({ name: 'text', company: 'text', email: 'text' });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
