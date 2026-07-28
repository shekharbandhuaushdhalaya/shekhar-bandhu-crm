const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  unit: { type: String, required: true, default: 'kg' }, // kg, g, l, ml, unit
  category: { type: String, default: 'Herb', trim: true },
  minReorder: { type: Number, default: 0 },
  cleaningLossPercent: { type: Number, default: 0, min: 0, max: 100 }, // typical % lost during cleaning/sorting
}, { timestamps: true });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
