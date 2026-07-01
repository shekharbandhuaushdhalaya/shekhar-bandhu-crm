const mongoose = require('mongoose');

// Stock ledger — every IN/OUT movement for a product
const stockLedgerSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseName: { type: String, required: true, trim: true },
  type:          { type: String, enum: ['IN', 'OUT', 'ADJUSTMENT'], required: true },
  qtyBoxes:      { type: Number, required: true },          // positive for IN, negative for OUT
  balanceBoxes:  { type: Number, required: true },          // running balance after this entry
  reference:     { type: String, default: '', trim: true }, // e.g. invoice no, challan no
  note:          { type: String, default: '', trim: true },
  createdBy:     { type: String, default: '', trim: true },
  packing:       { type: Number, default: 0 },              // packing size (pcs/box)
  vendorId:      { type: String, default: '', trim: true },
  vendorName:    { type: String, default: '', trim: true },
}, { timestamps: true });

stockLedgerSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('StockLedger', stockLedgerSchema);
