const mongoose = require('mongoose');

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
  details: { type: mongoose.Schema.Types.Mixed, default: null } // before/after JSON diff or payload
}, { timestamps: true });

auditLogSchema.index({ action: 1 });
auditLogSchema.index({ userEmail: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
