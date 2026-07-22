const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  unit: { type: String, required: true, default: 'kg' }, // kg, g, l, ml, unit
  category: { type: String, enum: ['Herb', 'Packaging', 'Excipient', 'General'], default: 'Herb', trim: true },
  minReorder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
