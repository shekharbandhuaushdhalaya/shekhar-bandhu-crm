const mongoose = require('mongoose');
const firmSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  legalName: { type: String, default: '', trim: true },
  gstin: { type: String, default: '', trim: true, uppercase: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  state: { type: String, default: '', trim: true },
  stateCode: { type: String, default: '', trim: true },
  country: { type: String, default: 'India' },
  pincode: { type: String, default: '', trim: true },
  currency: { type: String, default: 'INR' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  active: { type: Boolean, default: true },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
firmSchema.index({ name: 1 });
module.exports = mongoose.model('Firm', firmSchema);
