const mongoose = require('mongoose');
const jobSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null, index: true },
  status: { type: String, enum: ['queued','processing','completed','failed','dead'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  runAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: '' },
  lastError: { type: String, default: '' },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
jobSchema.index({ status: 1, runAt: 1 });
module.exports = mongoose.model('Job', jobSchema);
