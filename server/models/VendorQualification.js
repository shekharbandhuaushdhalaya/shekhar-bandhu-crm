const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const vendorQualificationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true },
  qualificationStatus: {
    type: String,
    enum: ['approved', 'conditional', 'disqualified'],
    default: 'conditional'
  },
  auditDate: { type: Date, required: true, default: Date.now },
  nextAuditDue: { type: Date, required: true },
  auditorName: { type: String, required: true, trim: true },
  auditedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // A score is optional evidence; never infer a perfect score when no assessment was recorded.
  gmpComplianceScore: { type: Number, default: null, min: 0, max: 100 },
  findings: { type: String, default: '' },
  rawMaterialIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' }],
  documents: [{ name: String, url: String, uploadedAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

vendorQualificationSchema.index({ vendorId: 1, qualificationStatus: 1 });
vendorQualificationSchema.index({ vendorId: 1, rawMaterialIds: 1, nextAuditDue: 1 });

vendorQualificationSchema.plugin(tenantPlugin);
module.exports = mongoose.model('VendorQualification', vendorQualificationSchema);
