const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const schema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String, required: true, trim: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  invoiceNo: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  promisedDate: { type: Date, required: true },
  status: { type: String, enum: ['pending','kept','missed','cancelled'], default: 'pending' },
  assignedMrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  assignedMrName: { type: String, default: '' },
  notes: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
  createdBy: { type: String, default: '' }
}, { timestamps: true });

schema.index({ firmId: 1, promisedDate: 1, status: 1 });
schema.index({ firmId: 1, customerId: 1, status: 1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('PaymentPromise', schema);
