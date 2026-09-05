const mongoose = require('mongoose');

const targetDoctorSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  doctorName: { type: String, required: true, trim: true },
  plannedTime: { type: String, default: '' },
  visited: { type: Boolean, default: false },
  visitedAt: { type: Date, default: null }
}, { _id: false });

const pjpSchema = new mongoose.Schema({
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  plannedDate: { type: Date, required: true },
  targetDoctors: [targetDoctorSchema],
  status: {
    type: String,
    enum: ['planned', 'completed', 'partially_completed', 'missed'],
    default: 'planned'
  },
  adherencePercentage: { type: Number, default: 0 },
  createdBy: { type: String, default: 'Admin' }
}, { timestamps: true });

pjpSchema.index({ mrId: 1, plannedDate: 1 });

module.exports = mongoose.model('PermanentJourneyPlan', pjpSchema);
