const mongoose = require('mongoose');

const stabilityStudySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', default: null },
  studyType: { type: String, enum: ['accelerated', 'real_time'], required: true },
  durationMonthsStudied: { type: Number, required: true },
  grantedShelfLifeYears: { type: Number, required: true },
  reportRef: { type: String, default: '', trim: true },
  reportSubmittedAt: { type: Date, default: null },
  submittedToLicensingAuthority: { type: Boolean, default: false },
  realTimeFollowUpDueBy: { type: Date, default: null },
  realTimeFollowUpStudyId: { type: mongoose.Schema.Types.ObjectId, ref: 'StabilityStudy', default: null },
  status: { type: String, enum: ['open', 'follow_up_due', 'closed'], default: 'open' },
  notes: { type: String, default: '' }
}, { timestamps: true });

stabilityStudySchema.index({ productId: 1 });
stabilityStudySchema.index({ realTimeFollowUpDueBy: 1, status: 1 });

module.exports = mongoose.model('StabilityStudy', stabilityStudySchema);
