const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const mrSampleOtpSchema = new mongoose.Schema({
  keyHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

mrSampleOtpSchema.index({ keyHash: 1 }, { unique: true });
mrSampleOtpSchema.plugin(tenantPlugin);
module.exports = mongoose.model('MrSampleOtp', mrSampleOtpSchema);
