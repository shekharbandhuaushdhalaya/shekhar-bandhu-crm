const mongoose = require('mongoose');

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
  longitude: { type: Number },
  category: { type: String, enum: ['A', 'B', 'C', ''], default: '' },
  specialty: { type: String, default: '', trim: true },
  birthday: { type: Date, default: null },
  anniversary: { type: Date, default: null },
  preferredTime: { type: String, default: '', trim: true },
  assignedMrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  areaName: { type: String, default: '', trim: true },
  preferredVisitDay: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', ''],
    default: ''
  },
  monthlySampleQuota: { type: Number, default: null }, // Monthly max sample units allowed (falls back to category default if null)
}, { timestamps: true });

contactSchema.index({ name: 'text', company: 'text', email: 'text' });
contactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Contact', contactSchema);
