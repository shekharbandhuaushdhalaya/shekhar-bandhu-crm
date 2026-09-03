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
  notes: { type: String, default: '', trim: true }
}, { timestamps: true });

equipmentSchema.index({ code: 'text', name: 'text', category: 'text' });

module.exports = mongoose.model('Equipment', equipmentSchema);
