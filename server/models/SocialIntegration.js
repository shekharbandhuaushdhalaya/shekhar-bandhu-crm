const mongoose = require('mongoose');

const socialIntegrationSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: ['facebook', 'instagram', 'linkedin', 'whatsapp'],
    required: true
  },
  accountId: { type: String, required: true },
  accountName: { type: String, default: '' },
  accessToken: { type: String, required: true },
  followersCount: { type: String, default: '0' },
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date, default: Date.now }
}, { timestamps: true });

socialIntegrationSchema.index({ platform: 1, accountId: 1 }, { unique: true });

module.exports = mongoose.model('SocialIntegration', socialIntegrationSchema);
