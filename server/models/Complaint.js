const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  complaintNo:  { type: String, required: true, unique: true, trim: true },
  type:         { type: String, enum: ['complaint', 'return', 'exchange'], default: 'complaint' },
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true, trim: true },
  customerPhone:{ type: String, default: '', trim: true },
  invoiceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo:    { type: String, default: '', trim: true },
  productName:  { type: String, default: '', trim: true },
  description:  { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority:     { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  resolution:   { type: String, default: '', trim: true },
  resolvedBy:   { type: String, default: '', trim: true },
  resolvedAt:   { type: Date },
  assignedTo:   { type: String, default: '', trim: true },
}, { timestamps: true });

complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ status: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
