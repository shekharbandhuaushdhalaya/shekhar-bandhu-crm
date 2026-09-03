const mongoose = require('mongoose');

const internalAuditSchema = new mongoose.Schema({
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  scheduledDate: { type: Date, required: true },
  completedDate: { type: Date, default: null },
  auditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  auditorNames: [{ type: String }],
  scope: { type: String, default: '', trim: true },
  findings: [{
    area: { type: String, required: true },
    observation: { type: String, required: true },
    severity: { type: String, enum: ['minor', 'major', 'critical'], default: 'minor' },
    correctiveAction: { type: String, default: '' },
    closedAt: { type: Date, default: null }
  }],
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed'], default: 'scheduled' }
}, { timestamps: true });

module.exports = mongoose.model('InternalAudit', internalAuditSchema);
