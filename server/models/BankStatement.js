const mongoose = require('mongoose');

const bankStatementSchema = new mongoose.Schema({
  accountName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  transactionDate: { type: Date, required: true },
  description: { type: String, default: '' },
  reference: { type: String, default: '' },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  matchedPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  matchedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  status: { type: String, enum: ['unmatched', 'matched', 'flagged'], default: 'unmatched' },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

bankStatementSchema.index({ transactionDate: -1 });
bankStatementSchema.index({ status: 1 });

module.exports = mongoose.model('BankStatement', bankStatementSchema);
