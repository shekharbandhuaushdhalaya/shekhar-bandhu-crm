const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: { type: String, default: '' },
  userEmail: { type: String, default: '' },
  action: { type: String, required: true }, // e.g. LOGIN_SUCCESS, CREATE_INVOICE, etc.
  description: { type: String, required: true },
  ipAddress: { type: String, default: '' },
  deviceInfo: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: null }, // before/after JSON diff or payload
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null, index: true },
  requestId: { type: String, default: '', index: true },
  resource: { type: String, default: '' },
  resourceId: { type: String, default: '' },
  reason: { type: String, default: '' }
}, { timestamps: true });

auditLogSchema.index({ action: 1 });
auditLogSchema.index({ userEmail: 1 });
auditLogSchema.index({ createdAt: -1 });

auditLogSchema.plugin(tenantPlugin);
module.exports = mongoose.model('AuditLog', auditLogSchema);
