const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

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
  matchedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  matchedByName: { type: String, default: '' },
  matchedAt: { type: Date, default: null },
  matchBasis: { type: String, enum: ['reference_amount_direction', 'amount_direction_date', ''], default: '' },
  matchNotes: { type: String, default: '', trim: true },
  status: { type: String, enum: ['unmatched', 'matched', 'flagged'], default: 'unmatched' },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

bankStatementSchema.index({ transactionDate: -1 });
bankStatementSchema.index({ status: 1 });
// A payment can be reconciled to at most one bank line within a firm.
bankStatementSchema.index(
  { firmId: 1, matchedPaymentId: 1 },
  { unique: true, partialFilterExpression: { matchedPaymentId: { $type: 'objectId' } } }
);

bankStatementSchema.plugin(tenantPlugin);
module.exports = mongoose.model('BankStatement', bankStatementSchema);
