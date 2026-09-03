const mongoose = require('mongoose');

const mrSampleBagSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRepresentative',
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  batchNo: { type: String, default: '', trim: true },
  expiryDate: { type: Date, default: null },
  qty: { type: Number, required: true, default: 0, min: 0 },
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  allocatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

mrSampleBagSchema.index({ mrId: 1, productId: 1, batchNo: 1 }, { unique: true });

module.exports = mongoose.model('MrSampleBag', mrSampleBagSchema);
