const mongoose = require('mongoose');
const refreshSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, unique: true },
  userAgent: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  revokedAt: { type: Date, default: null },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshSession', default: null },
  lastUsedAt: { type: Date, default: Date.now }
}, { timestamps: true });
module.exports = mongoose.model('RefreshSession', refreshSessionSchema);
