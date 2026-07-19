const mongoose = require('mongoose');

const medicalRepresentativeSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  phone:         { type: String, required: true, unique: true, trim: true },
  email:         { type: String, trim: true, lowercase: true },
  code:          { type: String, unique: true, sparse: true }, // MR code like MR-001
  photo:         { type: String, default: '' }, // profile photo URL
  territory:     { type: String, default: '', trim: true },
  reportingTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dateOfJoining: { type: Date, default: Date.now },
  isActive:      { type: Boolean, default: true },
  monthlyTarget: { type: Number, default: 0 }, // sales target in INR
  address:       { type: String, default: '' },
  alternatePhone:{ type: String, default: '' },
  aadharNumber:  { type: String, default: '' }, // masked or encrypted in production
  notes:         { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('MedicalRepresentative', medicalRepresentativeSchema);
