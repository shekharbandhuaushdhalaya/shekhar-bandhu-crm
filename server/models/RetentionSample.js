const mongoose = require('mongoose');

const retentionSampleSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', required: true },
  batchNo: { type: String, required: true, trim: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  qtyRetained: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'units' },
  storageLocation: { type: String, default: '', trim: true },
  retainedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  retainedByName: { type: String, default: '' },
  retainedAt: { type: Date, default: Date.now },
  retentionUntil: { type: Date, required: true },   // e.g. expiryDate + 1 year, computed at creation
  status: { type: String, enum: ['stored', 'disposed', 'used_for_investigation'], default: 'stored' },
  disposedAt: { type: Date, default: null },
  disposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  disposalNotes: { type: String, default: '' }
}, { timestamps: true });

retentionSampleSchema.index({ batchId: 1 });
retentionSampleSchema.index({ retentionUntil: 1, status: 1 });

module.exports = mongoose.model('RetentionSample', retentionSampleSchema);
