const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  recipients: [{
    phone: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    channel: { type: String, default: '' },
    providerId: { type: String, default: '' },
    error: { type: String, default: '' },
    sentAt: { type: Date, default: null },
  }],
  status: { type: String, enum: ['queued', 'processing', 'completed', 'partial', 'failed'], default: 'queued' },
  queuedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ firmId: 1, createdAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('BroadcastCampaign', schema);
