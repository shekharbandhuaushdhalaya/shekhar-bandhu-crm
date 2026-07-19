const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  platform: {
    type: String,
    enum: ['social_media', 'email', 'sms', 'whatsapp', 'google', 'other'],
    default: 'social_media',
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
    default: 'draft',
  },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  budget: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  targetAudience: { type: String, default: '' },
  content: { type: String, default: '' },
  notes: { type: String, default: '' },
  analytics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    leads: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  launchedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

campaignSchema.index({ name: 'text' });

module.exports = mongoose.model('Campaign', campaignSchema);
