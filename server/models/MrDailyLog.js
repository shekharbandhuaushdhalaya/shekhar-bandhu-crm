const mongoose = require('mongoose');

const mrDailyLogSchema = new mongoose.Schema({
  mrId:        { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  date:        { type: Date, required: true },
  checkIn: {
    time:      { type: Date },
    latitude:  { type: Number },
    longitude: { type: Number },
    photo:     { type: String, default: '' }, // selfie at check-in
    location:  { type: String, default: '' }, // human-readable address
  },
  checkOut: {
    time:      { type: Date },
    latitude:  { type: Number },
    longitude: { type: Number },
    photo:     { type: String, default: '' },
    location:  { type: String, default: '' },
  },
  startKmReading:  { type: Number, default: 0 },
  endKmReading:    { type: Number, default: 0 },
  totalDistance:   { type: Number, default: 0 },   // odometer-based (endKm - startKm)
  gpsDistance:     { type: Number, default: 0 },   // GPS straight-line (Haversine) in km
  status:          { type: String, enum: ['checked_in', 'checked_out'], default: 'checked_in' },
  notes:           { type: String, default: '' },
}, { timestamps: true });

mrDailyLogSchema.index({ mrId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('MrDailyLog', mrDailyLogSchema);
