const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '' },
  productCategory: { type: String, default: 'General' },
  pakkaBalance: { type: Number, default: 0 },
  kachhaBalance: { type: Number, default: 0 },
  paymentTerms: { type: String, default: 'Net 30' },
  gstin: { type: String, default: '', trim: true },
  state: { type: String, default: 'Maharashtra', trim: true },
  registeredName: { type: String, default: '', trim: true },
  displayName: { type: String, default: '', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  addressPin: { type: String, default: '', trim: true },
  addressCity: { type: String, default: '', trim: true },
  pan: { type: String, default: '', trim: true },
  bankAccountNumber: { type: String, default: '', trim: true },
  bankIfsc: { type: String, default: '', trim: true },
  bankName: { type: String, default: '', trim: true },
  bankBranch: { type: String, default: '', trim: true }
}, { timestamps: true });

vendorSchema.index({ name: 'text', company: 'text', email: 'text', productCategory: 'text' });
vendorSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Vendor', vendorSchema);
