const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const schema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', index: true, default: null },
  key: { type: String, required: true }, method: { type: String, required: true }, path: { type: String, required: true }, fingerprint: { type: String, required: true },
  status: { type: String, enum: ['processing','completed'], default: 'processing' }, statusCode: { type: Number, default: 200 }, response: { type: mongoose.Schema.Types.Mixed, default: null }, completedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ firmId: 1, key: 1, method: 1, path: 1 }, { unique: true, name: 'firmId_1_key_1_method_1_path_1_unique' });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('IdempotencyKey', schema);
