const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const schema = new mongoose.Schema({
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'MrVisit', default: null },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  doctorName: { type: String, default: '' },
  brand: { type: String, default: '' },
  company: { type: String, default: '' },
  product: { type: String, default: '' },
  price: { type: Number, default: 0 },
  scheme: { type: String, default: '' },
  notes: { type: String, default: '' },
  observedAt: { type: Date, default: Date.now }
}, { timestamps: true });
schema.index({ firmId: 1, mrId: 1, observedAt: -1 });
schema.index({ firmId: 1, brand: 1, observedAt: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('CompetitorObservation', schema);
