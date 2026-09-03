const mongoose = require('mongoose');

const generalExpenseSchema = new mongoose.Schema({
  expenseNo: { type: String, required: true, unique: true, trim: true },
  category: {
    type: String,
    enum: ['rent', 'utilities', 'office_supplies', 'logistics', 'salaries', 'maintenance', 'marketing', 'other'],
    default: 'other'
  },
  title: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  vendorName: { type: String, default: '', trim: true },
  paymentMode: { type: String, enum: ['cash', 'bank_transfer', 'upi', 'cheque'], default: 'bank_transfer' },
  receiptUrl: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

generalExpenseSchema.index({ expenseNo: 1, date: -1, category: 1 });

module.exports = mongoose.model('GeneralExpense', generalExpenseSchema);
