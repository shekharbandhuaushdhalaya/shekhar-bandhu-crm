const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const deviationCapaSchema = new mongoose.Schema({
  deviationNo: { type: String, required: true, unique: true, trim: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', default: null },
  batchNo: { type: String, required: true, trim: true },
  stageId: { type: String, default: '' },
  stageName: { type: String, default: '', trim: true },
  deviationType: {
    type: String,
    enum: ['qc_failure', 'abnormal_loss', 'equipment_breakdown', 'temp_excursion', 'material_mismatch', 'customer_complaint_cluster', 'other'],
    required: true
  },
  description: { type: String, required: true, trim: true },
  rootCause: { type: String, default: '', trim: true },
  correctiveAction: { type: String, default: '', trim: true },
  preventiveAction: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['open', 'under_investigation', 'capa_assigned', 'resolved', 'closed'],
    default: 'open'
  },
  reportedBy: { type: String, default: '' },
  reportedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sourceTestCode: { type: String, default: '', trim: true },
  sourceQcTestId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceSpecificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductQualitySpecification', default: null },
  sourceSpecificationVersion: { type: String, default: '', trim: true },
  signedOffBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  signedOffByName: { type: String, default: '' },
  signedOffAt: { type: Date, default: null },
  effectivenessCheck: { type: String, default: '', trim: true },
  effectivenessEvidenceRef: { type: String, default: '', trim: true },
  closureVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closureVerifiedByName: { type: String, default: '' },
  closureVerifiedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null }
}, { timestamps: true });

deviationCapaSchema.index({ deviationNo: 'text', batchNo: 'text', deviationType: 'text' });

deviationCapaSchema.plugin(tenantPlugin);
module.exports = mongoose.model('DeviationCapa', deviationCapaSchema);
