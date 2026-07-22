const mongoose = require('mongoose');

const journalLineSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  accountCode: { type: String, required: true },
  accountName: { type: String, required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  entryNo: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  description: { type: String, required: true },
  referenceType: { type: String, default: '' },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lines: [journalLineSchema],
  status: { type: String, enum: ['draft', 'posted'], default: 'draft' }
}, { timestamps: true });

journalEntrySchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
