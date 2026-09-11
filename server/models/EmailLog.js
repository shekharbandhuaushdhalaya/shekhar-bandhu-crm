const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const schema = new mongoose.Schema({
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null, index: true },
  to: { type: String, required: true }, from: { type: String, default: '' }, subject: { type: String, default: '' }, provider: { type: String, default: 'resend' },
  status: { type: String, enum: ['queued','sent','failed'], default: 'queued' }, providerId: { type: String, default: '' }, error: { type: String, default: '' }, sentAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ firmId: 1, createdAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('EmailLog', schema);
