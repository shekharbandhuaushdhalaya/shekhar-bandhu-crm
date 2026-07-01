const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  addressLine1: { type: String, default: '', trim: true },
  addressLine2: { type: String, default: '', trim: true },
  city:        { type: String, default: '', trim: true },
  state:       { type: String, default: '', trim: true },
  pincode:     { type: String, default: '', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  phone:       { type: String, default: '', trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
