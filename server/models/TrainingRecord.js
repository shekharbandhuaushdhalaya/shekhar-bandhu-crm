const mongoose = require('mongoose');

const trainingRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  topic: { type: String, required: true, trim: true },
  trainedOn: { type: Date, required: true },
  trainedBy: { type: String, default: '', trim: true },
  validUntil: { type: Date, default: null },
  certificateRef: { type: String, default: '' }
}, { timestamps: true });

trainingRecordSchema.index({ userId: 1, topic: 1 });

module.exports = mongoose.model('TrainingRecord', trainingRecordSchema);
