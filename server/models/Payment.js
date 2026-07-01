const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['receive', 'make'], 
    required: true 
  },
  partyType: { 
    type: String, 
    enum: ['Customer', 'Vendor'], 
    required: true 
  },
  partyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    refPath: 'partyType'
  },
  partyName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  amount: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  mode: { 
    type: String, 
    enum: ['pakka', 'kachha'], 
    default: 'pakka' 
  },
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI'], 
    default: 'Cash' 
  },
  referenceNo: { 
    type: String, 
    default: '', 
    trim: true 
  },
  notes: { 
    type: String, 
    default: '', 
    trim: true 
  },
  date: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Index for easy searching
paymentSchema.index({ partyName: 'text', paymentMethod: 'text', referenceNo: 'text' });
paymentSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
