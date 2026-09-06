const mongoose = require('mongoose');

const mrSampleIssuanceSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRepresentative',
    required: true,
    index: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
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
    min: 1,
  },
  unitCost: {
    type: Number,
    default: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

mrSampleIssuanceSchema.index({ mrId: 1, doctorId: 1, date: -1 });

module.exports = mongoose.model('MrSampleIssuance', mrSampleIssuanceSchema);
