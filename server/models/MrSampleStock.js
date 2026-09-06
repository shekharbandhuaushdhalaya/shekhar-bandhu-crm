const mongoose = require('mongoose');

const mrSampleStockSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRepresentative',
    required: true,
    index: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  qty: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  lastIssuedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

mrSampleStockSchema.index({ mrId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('MrSampleStock', mrSampleStockSchema);
