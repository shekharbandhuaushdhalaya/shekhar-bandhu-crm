const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const medicalRepresentativeSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  phone:         { type: String, required: true, unique: true, trim: true },
  email:         { type: String, trim: true, lowercase: true },
  code:          { type: String, unique: true, sparse: true }, // MR code like MR-001
  photo:         { type: String, default: '' }, // profile photo URL
  territory:     { type: String, default: '', trim: true },
  territories:   [{ type: String, trim: true }],
  division:      { type: String, default: '', trim: true },
  team:          { type: String, default: '', trim: true },
  designation:   { type: String, default: 'Medical Representative', trim: true },
  employmentType:{ type: String, enum: ['full_time', 'part_time', 'contract', 'other'], default: 'full_time' },
  backupMrId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', default: null },
  defaultVisitTypes: [{ type: String, trim: true }],
  targetConfig: {
    sales: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    newDoctors: { type: Number, default: 0 },
    followUps: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
  },
  reportingTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dateOfJoining: { type: Date, default: Date.now },
  isActive:      { type: Boolean, default: true },
  monthlyTarget: { type: Number, default: 0 }, // sales target in INR
  address:       { type: String, default: '' },
  alternatePhone:{ type: String, default: '' },
  aadharNumber:  { type: String, default: '' }, // masked or encrypted in production
  notes:         { type: String, default: '' },
}, { timestamps: true });

medicalRepresentativeSchema.plugin(tenantPlugin);
module.exports = mongoose.model('MedicalRepresentative', medicalRepresentativeSchema);
