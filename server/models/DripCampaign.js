const mongoose = require('mongoose');

const campaignStepSchema = new mongoose.Schema({
  stepNumber: { type: Number, required: true },
  dayOffset: { type: Number, required: true, default: 0 },
  subject: { type: String, default: '' },
  templateBody: { type: String, required: true },
  channel: { type: String, enum: ['whatsapp', 'email'], default: 'whatsapp' }
}, { _id: false });

const dripCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  targetAudience: {
    type: String,
    enum: ['leads', 'distributors', 'doctors', 'chemists'],
    default: 'leads'
  },
  channel: { type: String, enum: ['whatsapp', 'email', 'omnichannel'], default: 'whatsapp' },
  steps: [campaignStepSchema],
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'draft'],
    default: 'draft'
  },
  enrolledCount: { type: Number, default: 0 },
  convertedCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DripCampaign', dripCampaignSchema);
