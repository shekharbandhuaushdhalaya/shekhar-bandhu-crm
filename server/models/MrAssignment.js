const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const mrAssignmentSchema = new mongoose.Schema({
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
  entityType: { type: String, enum: ['doctor', 'chemist', 'stockist', 'institution', 'distributor', 'other'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  entityName: { type: String, required: true, trim: true },
  entityPhone: { type: String, default: '' },
  territory: { type: String, default: '', trim: true },
  area: { type: String, default: '', trim: true },
  role: { type: String, enum: ['primary', 'secondary', 'temporary'], default: 'primary' },
  priority: { type: String, enum: ['A', 'B', 'C', 'normal'], default: 'normal' },
  preferredVisitDays: [{ type: String }],
  preferredVisitTime: { type: String, default: '' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

mrAssignmentSchema.index({ mrId: 1, isActive: 1, entityType: 1 });
mrAssignmentSchema.index({ entityId: 1, entityType: 1, isActive: 1 });
mrAssignmentSchema.index({ mrId: 1, startDate: 1, endDate: 1 });
mrAssignmentSchema.plugin(tenantPlugin);
module.exports = mongoose.model('MrAssignment', mrAssignmentSchema);
