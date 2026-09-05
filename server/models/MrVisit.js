const mongoose = require('mongoose');

const mrVisitSchema = new mongoose.Schema({
  mrId:          { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  dailyLogId:    { type: mongoose.Schema.Types.ObjectId, ref: 'MrDailyLog', default: null },
  date:          { type: Date, required: true },
  doctorId:      { type: mongoose.Schema.Types.ObjectId, refPath: 'doctorRefModel', default: null },
  doctorRefModel:{ type: String, enum: ['Contact', 'Customer'], default: 'Contact' },
  doctorName:    { type: String, required: true, trim: true },
  clinicName:    { type: String, default: '', trim: true },
  specialization:{ type: String, default: '', trim: true },
  address:       { type: String, default: '' },
  city:          { type: String, default: '' },
  pincode:       { type: String, default: '' },
  latitude:      { type: Number },
  longitude:     { type: Number },
  checkIn: {
    time:        { type: Date },
    photo:       { type: String, default: '' }, // selfie at doctor's clinic
  },
  checkOut: {
    time:        { type: Date },
    photo:       { type: String, default: '' },
  },
  purpose:       { type: String, enum: ['promotion', 'sampling', 'collection', 'followup', 'meeting', 'other'], default: 'promotion' },
  samplesGiven:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  sampleDetails: [{ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, name: String, qty: Number, batchNo: { type: String, default: '' } }],
  orderTaken:    { type: Boolean, default: false },
  orderAmount:   { type: Number, default: 0 },
  feedback:      { type: String, default: '' },
  doctorVerified:{ type: Boolean, default: false },
  doctorVerifiedAt:{ type: Date },
  doctorSignature: { type: String, default: '' }, // base64, SVG or URL of doctor signature acknowledgment
  sampleOtpVerified:{ type: Boolean, default: false },
  sampleAckOtp:    { type: String, default: '' },
  status:        { type: String, enum: ['planned', 'checked_in', 'checked_out', 'cancelled'], default: 'planned' },
  notes:         { type: String, default: '' },
}, { timestamps: true });

mrVisitSchema.index({ mrId: 1, date: -1 });
mrVisitSchema.index({ doctorId: 1, date: -1 });

module.exports = mongoose.model('MrVisit', mrVisitSchema);
