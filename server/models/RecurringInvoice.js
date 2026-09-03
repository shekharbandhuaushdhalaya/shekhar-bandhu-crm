const mongoose = require('mongoose');

const recurringItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  packing: { type: Number, default: 1 },
  qty: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 0 },
  amount: { type: Number, required: true, min: 0 }
});

const recurringInvoiceSchema = new mongoose.Schema({
  templateName: { type: String, required: true, trim: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true, trim: true },
  frequency: { type: String, enum: ['weekly', 'monthly', 'quarterly'], default: 'monthly' },
  nextRunDate: { type: Date, required: true },
  lastRunDate: { type: Date, default: null },
  items: [recurringItemSchema],
  totalAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
  generatedInvoicesCount: { type: Number, default: 0 },
  lastGeneratedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

recurringInvoiceSchema.index({ nextRunDate: 1, status: 1 });

module.exports = mongoose.model('RecurringInvoice', recurringInvoiceSchema);
