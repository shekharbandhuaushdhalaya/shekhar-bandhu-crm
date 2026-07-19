const mongoose = require('mongoose');

const mrExpenseSchema = new mongoose.Schema({
  mrId:          { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  date:          { type: Date, required: true },
  category:      { type: String, enum: ['travel', 'food', 'stay', 'conveyance', 'stationery', 'mobile', 'misc'], required: true },
  amount:        { type: Number, required: true, min: 0 },
  description:   { type: String, default: '' },
  receiptUrl:    { type: String, default: '' }, // uploaded receipt image
  latitude:      { type: Number },
  longitude:     { type: Number },
  location:      { type: String, default: '' },
  status:        { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt:    { type: Date },
  rejectionReason:{ type: String, default: '' },
}, { timestamps: true });

mrExpenseSchema.index({ mrId: 1, date: -1 });
mrExpenseSchema.index({ status: 1 });

module.exports = mongoose.model('MrExpense', mrExpenseSchema);
