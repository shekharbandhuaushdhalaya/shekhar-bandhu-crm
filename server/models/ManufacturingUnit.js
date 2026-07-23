const mongoose = require('mongoose');

const manufacturingUnitSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true }, // e.g. MFG-VARANASI
  addressLine1: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  state: { type: String, default: '', trim: true },
  pincode: { type: String, default: '', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ManufacturingUnit', manufacturingUnitSchema);
