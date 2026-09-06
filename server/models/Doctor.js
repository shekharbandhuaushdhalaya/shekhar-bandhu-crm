const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  clinicName: { type: String, default: '', trim: true },
  specialization: { type: String, default: '', trim: true },
  category: { type: String, enum: ['A', 'B', 'C', ''], default: '' },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  address: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  pincode: { type: String, default: '', trim: true },
  latitude: { type: Number },
  longitude: { type: Number },
  birthday: { type: Date, default: null },
  anniversary: { type: Date, default: null },
  preferredTime: { type: String, default: '', trim: true },
  preferredVisitDay: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', ''],
    default: ''
  },
  monthlySampleQuota: { type: Number, default: null },
  assignedMrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  areaName: { type: String, default: '', trim: true },
  linkedContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  linkedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

doctorSchema.index({ name: 'text', clinicName: 'text' });
doctorSchema.index({ assignedMrId: 1 });
doctorSchema.index({ category: 1 });

module.exports = mongoose.model('Doctor', doctorSchema);
