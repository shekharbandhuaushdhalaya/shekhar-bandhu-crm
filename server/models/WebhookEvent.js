const mongoose = require('mongoose');
const webhookEventSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  eventType: { type: String, default: '' },
  signatureValid: { type: Boolean, default: false },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['received','processing','processed','failed','ignored'], default: 'received' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  processedAt: { type: Date, default: null }
}, { timestamps: true });
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
