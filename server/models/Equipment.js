const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['mixer', 'drier', 'pulverizer', 'tableting', 'filling', 'packaging', 'qc_instrument', 'other'],
    required: true
  },
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  calibrationDueDate: { type: Date, default: null },
  lastMaintenanceDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ['active', 'under_maintenance', 'calibration_due', 'decommissioned'],
    default: 'active'
  },
  notes: { type: String, default: '', trim: true },
  calibrationFrequencyDays: { type: Number, default: 180 },
  calibrationLogs: [{
    calibratedOn: { type: Date, default: Date.now },
    calibratedBy: String,
    nextDue: Date,
    certificateNo: String,
    notes: String
  }],
  maintenanceLogs: [{
    maintainedOn: { type: Date, default: Date.now },
    maintainedBy: String,
    type: { type: String, enum: ['preventive', 'breakdown', 'routine'], default: 'preventive' },
    details: String,
    cost: Number
  }]
}, { timestamps: true });

equipmentSchema.index({ code: 'text', name: 'text', category: 'text' });

module.exports = mongoose.model('Equipment', equipmentSchema);
