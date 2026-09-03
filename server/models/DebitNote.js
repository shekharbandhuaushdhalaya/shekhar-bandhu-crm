const mongoose = require('mongoose');

const debitNoteItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  size: { type: String, default: '' },
  packing: { type: Number, default: 1 },
  qty: { type: Number, required: true, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
  amount: { type: Number, required: true, min: 0 }
});

const debitNoteSchema = new mongoose.Schema({
  debitNoteNo: { type: String, required: true, unique: true, trim: true },
  partyType: { type: String, enum: ['customer', 'vendor'], default: 'customer' },
  partyId: { type: mongoose.Schema.Types.ObjectId, required: true },
  partyName: { type: String, required: true, trim: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  invoiceNo: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
  items: [debitNoteItemSchema],
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: '', trim: true },
  status: { type: String, enum: ['draft', 'finalized', 'cancelled'], default: 'draft' },
  createdBy: { type: String, default: 'System' },
  notes: { type: String, default: '' }
}, { timestamps: true });

debitNoteSchema.index({ debitNoteNo: 1 });
debitNoteSchema.index({ partyId: 1, date: -1 });

module.exports = mongoose.model('DebitNote', debitNoteSchema);
