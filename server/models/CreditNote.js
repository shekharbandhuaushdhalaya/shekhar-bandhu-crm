const mongoose = require('mongoose');

const creditNoteItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, default: 0 },
  boxes: { type: Number, default: 0 },
  packing: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  batchNo: { type: String, default: '', trim: true }
}, { _id: false });

const creditNoteSchema = new mongoose.Schema({
  noteNo: { type: String, required: true, unique: true },
  type: { type: String, enum: ['credit_note', 'debit_note'], required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo: { type: String, default: '' },
  partyType: { type: String, enum: ['Customer', 'Vendor'], required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'partyType' },
  partyName: { type: String, required: true },
  date: { type: Date, default: Date.now },
  reason: { type: String, default: '' },
  baseAmount: { type: Number, default: 0 },
  gstRate: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'finalized', 'cancelled'], default: 'draft' },
  items: [creditNoteItemSchema]
}, { timestamps: true });

creditNoteSchema.index({ noteNo: 'text', partyName: 'text' });
creditNoteSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model('CreditNote', creditNoteSchema);
