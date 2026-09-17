const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const interactionSchema = new mongoose.Schema({
  type: { type: String, required: true },
  note: { type: String, default: '' },
  date: { type: Date, default: Date.now },
});

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '' },
  stage: {
    type: String,
    enum: ['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'],
    default: 'lead',
  },
  dealValue: { type: Number, default: 0 },
  productInterest: { type: [String], default: [] },
  estimatedVolume: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  leadSource: {
    type: String,
    enum: ['IndiaMart', 'JustDial', 'TradeIndia', 'WhatsApp', 'Reference', 'Website', 'Direct Walk-in', 'Cold Call'],
    default: 'Direct Walk-in',
  },
  interactions: [interactionSchema],
  latitude: { type: Number },
  areaName: { type: String, default: '', trim: true },
}, { timestamps: true });

contactSchema.index({ name: 'text', company: 'text', email: 'text' });
contactSchema.index({ createdAt: -1 });
contactSchema.index({ firmId: 1, stage: 1, dealValue: 1 });

contactSchema.plugin(tenantPlugin);
module.exports = mongoose.model('Contact', contactSchema);
