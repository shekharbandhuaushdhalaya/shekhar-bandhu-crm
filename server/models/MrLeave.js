const mongoose = require('mongoose');

const mrLeaveSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRepresentative',
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  leaveType: {
    type: String,
    enum: ['casual', 'sick', 'earned', 'off_territory'],
    default: 'casual'
  },
  reason: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: { type: Date },
  rejectionReason: { type: String, default: '', trim: true }
}, { timestamps: true });

mrLeaveSchema.index({ mrId: 1, startDate: -1 });

module.exports = mongoose.model('MrLeave', mrLeaveSchema);
