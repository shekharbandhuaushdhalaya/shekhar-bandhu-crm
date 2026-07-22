const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  partyId:    { type: mongoose.Schema.Types.ObjectId },
  partyType:  { type: String, enum: ['Customer', 'Vendor'], required: true },
  partyName:  { type: String, default: '', trim: true },

  date:       { type: Date, default: Date.now },
  mode:       { type: String, enum: ['cash', 'regular', ''], default: '' },

  // Reference document
  refModel:   { type: String, default: '' },          // 'Invoice', 'StockMovement', 'Payment'
  refId:      { type: mongoose.Schema.Types.ObjectId },
  refNo:      { type: String, default: '', trim: true },

  debit:      { type: Number, default: 0 },           // Amount customer owes us
  credit:     { type: Number, default: 0 },           // Amount we owe / payment received
  balance:    { type: Number, default: 0 },           // Running balance (optional, can be computed)

  description: { type: String, default: '', trim: true },
  createdBy:   { type: String, default: '', trim: true },
}, { timestamps: true });

ledgerEntrySchema.index({ partyId: 1, date: -1 });
ledgerEntrySchema.index({ refId: 1 });
ledgerEntrySchema.index({ createdAt: -1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
