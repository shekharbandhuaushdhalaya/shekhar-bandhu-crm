const mongoose = require('mongoose');

const tourPlanEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  territory: { type: String, default: '', trim: true },
  targetDoctorNames: [{ type: String, trim: true }],
  targetChemistNames: [{ type: String, trim: true }],
  notes: { type: String, default: '', trim: true },
});

const mrTourPlanSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRepresentative',
    required: true,
  },
  month: { type: String, required: true }, // e.g. "09"
  year: { type: Number, required: true },  // e.g. 2026
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'draft',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  entries: [tourPlanEntrySchema],
}, { timestamps: true });

mrTourPlanSchema.index({ mrId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('MrTourPlan', mrTourPlanSchema);
