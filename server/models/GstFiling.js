const mongoose = require('mongoose');

const gstFilingSchema = new mongoose.Schema({
  period: { type: String, required: true }, // e.g. "2026-07"
  returnType: { type: String, required: true, enum: ['gstr1', 'gstr3b'] },
  arn: { type: String, required: true },
  filedDate: { type: Date, default: Date.now },
  filedBy: { type: String },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  supportingDocuments: [
    {
      name: { type: String },
      url: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

// Avoid duplicate filings for same return type & period
gstFilingSchema.index({ period: 1, returnType: 1 }, { unique: true });

module.exports = mongoose.model('GstFiling', gstFilingSchema);
