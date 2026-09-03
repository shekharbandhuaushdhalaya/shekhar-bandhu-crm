const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  customerName: { type: String, required: true, trim: true },
  contactPhone: { type: String, default: '', trim: true },
  contactEmail: { type: String, default: '', trim: true, lowercase: true },
  dealValue: { type: Number, required: true, default: 0 },
  stage: {
    type: String,
    enum: ['lead', 'qualification', 'proposal', 'negotiation', 'won', 'lost'],
    default: 'lead'
  },
  winProbability: { type: Number, default: 20, min: 0, max: 100 }, // percentage
  expectedCloseDate: { type: Date, default: null },
  assignedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedAgentName: { type: String, default: '', trim: true },
  source: { type: String, default: 'Direct', trim: true },
  notes: { type: String, default: '' },
  lostReason: { type: String, default: '' }
}, { timestamps: true });

leadSchema.index({ stage: 1, assignedAgentId: 1 });

module.exports = mongoose.model('Lead', leadSchema);
