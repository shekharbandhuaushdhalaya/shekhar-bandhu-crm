const mongoose = require('mongoose');

const vendorQualificationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true, trim: true },
  qualificationStatus: {
    type: String,
    enum: ['approved', 'conditional', 'disqualified'],
    default: 'approved'
  },
  auditDate: { type: Date, required: true, default: Date.now },
  nextAuditDue: { type: Date, required: true },
  auditorName: { type: String, required: true, trim: true },
  gmpComplianceScore: { type: Number, default: 100, min: 0, max: 100 },
  findings: { type: String, default: '' },
  rawMaterialIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' }],
  documents: [{ name: String, url: String, uploadedAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

vendorQualificationSchema.index({ vendorId: 1, qualificationStatus: 1 });

module.exports = mongoose.model('VendorQualification', vendorQualificationSchema);
