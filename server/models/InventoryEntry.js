const mongoose = require('mongoose');

// One record per (product + vendor + warehouse + packing) — qty stored in BOXES
const inventoryEntrySchema = new mongoose.Schema({
  warehouseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseName: { type: String, required: true, trim: true },
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productType:   { type: String, default: '', trim: true },
  size:          { type: String, default: '', trim: true },
  colour:        { type: String, default: '', trim: true },
  shape:         { type: String, default: '', trim: true },
  weight:        { type: String, default: '', trim: true },
  hsnCode:       { type: String, default: '', trim: true },
  vendorId:      { type: String, default: '', trim: true },
  vendorName:    { type: String, default: '', trim: true },
  qtyBoxes:      { type: Number, default: 0 },  // quantity in BOXES
  packing:       { type: Number, required: true, default: 0 }, // pcs/box
  batchNo:       { type: String, default: '', trim: true },
  mfgDate:       { type: Date },
  expiryDate:    { type: Date },
  manufacturingUnitId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ManufacturingUnit' },
  manufacturingUnitName: { type: String, default: '', trim: true }
}, { timestamps: true });

// Unique stock slot = product + vendor + warehouse + packing size + batch number
inventoryEntrySchema.index({ warehouseId: 1, productId: 1, vendorId: 1, packing: 1, batchNo: 1 }, { unique: true });
inventoryEntrySchema.index({ warehouseId: 1, productId: 1, vendorId: 1, packing: 1, createdAt: 1 });
inventoryEntrySchema.index({ expiryDate: 1, qtyBoxes: 1 });

module.exports = mongoose.model('InventoryEntry', inventoryEntrySchema);
