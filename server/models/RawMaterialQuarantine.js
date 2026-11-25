const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const rawMaterialQuarantineSchema = new mongoose.Schema({
  quarantineLotNo: { type: String, required: true, unique: true },
  herbName: { type: String, required: true, index: true },
  botanicalName: { type: String, default: '' },
  batchNo: { type: String, required: true, index: true },
  supplierName: { type: String, required: true, trim: true },
  qty: { type: Number, required: true },
  unit: { type: String, default: 'kg' },
  receivedDate: { type: Date, default: Date.now },
  quarantineStatus: {
    type: String,
    enum: ['under_testing', 'released', 'rejected'],
    default: 'under_testing',
    index: true,
  },
  testReportNo: { type: String, default: '' },
  qcSpecificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialQualitySpecification', default: null },
  qcSpecificationVersion: { type: String, default: '', trim: true },
  qcSpecificationTests: [{
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    specification: { type: String, required: true, trim: true },
    unit: { type: String, default: '', trim: true },
    methodReference: { type: String, required: true, trim: true },
    mandatory: { type: Boolean, default: true }
  }],
  inspectionResults: [{
    testCode: { type: String, required: true, trim: true },
    testName: { type: String, required: true, trim: true },
    methodReference: { type: String, required: true, trim: true },
    specification: { type: String, required: true, trim: true },
    result: { type: String, required: true, trim: true },
    unit: { type: String, default: '', trim: true },
    outcome: { type: String, enum: ['pass', 'fail'], required: true },
    evidenceRef: { type: String, default: '', trim: true }
  }],
  inspectionRecordedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  inspectionRecordedByName: { type: String, default: '', trim: true },
  inspectionRecordedAt: { type: Date, default: null },
  testingDate: { type: Date },
  expiryDate: { type: Date, required: true, index: true },
  testedBy: { type: String, default: '' },
  releasedBy: { type: String, default: '' },
  remarks: { type: String, default: '' },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', default: null },
  rawMaterialEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialEntry', default: null },
}, { timestamps: true });

rawMaterialQuarantineSchema.pre('validate', function validateDispositionEvidence(next) {
  if (['released', 'rejected'].includes(this.quarantineStatus)) {
    if (!this.testReportNo?.trim() || !this.testedBy?.trim() || !this.releasedBy?.trim() || !this.remarks?.trim() || !this.testingDate) {
      return next(new Error('A final quarantine disposition requires test report, tester, approver, testing date, and remarks'));
    }
  }
  next();
});

// One stock entry can have only one quarantine record per tenant. The partial
// index keeps legacy/manual records without a stock-entry link valid.
rawMaterialQuarantineSchema.index({ rawMaterialEntryId: 1 }, {
  unique: true,
  partialFilterExpression: { rawMaterialEntryId: { $type: 'objectId' } }
});
rawMaterialQuarantineSchema.index({ rawMaterialEntryId: 1, quarantineStatus: 1 });
rawMaterialQuarantineSchema.plugin(tenantPlugin);
module.exports = mongoose.model('RawMaterialQuarantine', rawMaterialQuarantineSchema);
