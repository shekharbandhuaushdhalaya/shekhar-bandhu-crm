const mongoose = require('mongoose');

const sampleConversionSchema = new mongoose.Schema({
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  mrName: { type: String, required: true, trim: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  doctorName: { type: String, required: true, trim: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true, trim: true },
  samplesQtyGiven: { type: Number, required: true, min: 1 },
  givenDate: { type: Date, default: Date.now },
  conversionStatus: {
    type: String,
    enum: ['pending', 'converted', 'no_conversion'],
    default: 'pending'
  },
  resultingInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  prescriptionOrderAmount: { type: Number, default: 0 },
  convertedAt: { type: Date, default: null }
}, { timestamps: true });

sampleConversionSchema.index({ mrId: 1, doctorId: 1, conversionStatus: 1 });

module.exports = mongoose.model('SampleConversion', sampleConversionSchema);
