const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  key: { type: String, required: true }, method: { type: String, required: true }, path: { type: String, required: true }, fingerprint: { type: String, required: true },
  status: { type: String, enum: ['processing','completed'], default: 'processing' }, statusCode: { type: Number, default: 200 }, response: { type: mongoose.Schema.Types.Mixed, default: null }, completedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ key: 1, method: 1, path: 1, fingerprint: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
module.exports = mongoose.model('IdempotencyKey', schema);
