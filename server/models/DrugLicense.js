const mongoose = require('mongoose');

const drugLicenseSchema = new mongoose.Schema({
  licenseNo: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true },
  licenseType: {
    type: String,
    enum: ['Ayush_Form_25D', 'Ayush_Form_28D', 'Wholesale_20B', 'Retail_20', 'GMP_Certificate', 'Other'],
    default: 'Ayush_Form_25D'
  },
  issuingAuthority: { type: String, required: true, trim: true },
  state: { type: String, default: 'Uttar Pradesh', trim: true },
  issuedDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['valid', 'expiring_soon', 'expired'],
    default: 'valid'
  },
  renewalAppliedDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  documents: [{ name: String, url: String, uploadedAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

drugLicenseSchema.index({ licenseNo: 1, expiryDate: 1, status: 1 });

module.exports = mongoose.model('DrugLicense', drugLicenseSchema);
