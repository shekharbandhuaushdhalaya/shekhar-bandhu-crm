const mongoose = require('mongoose');

const deviationCapaSchema = new mongoose.Schema({
  deviationNo: { type: String, required: true, unique: true, trim: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', required: true },
  batchNo: { type: String, required: true, trim: true },
  stageId: { type: String, default: '' },
  stageName: { type: String, default: '', trim: true },
  deviationType: {
    type: String,
    enum: ['qc_failure', 'abnormal_loss', 'equipment_breakdown', 'temp_excursion', 'material_mismatch', 'other'],
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
  reportedBy: { type: String, default: 'System Accountant' },
  signedOffBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  signedOffAt: { type: Date, default: null }
}, { timestamps: true });

deviationCapaSchema.index({ deviationNo: 'text', batchNo: 'text', deviationType: 'text' });

module.exports = mongoose.model('DeviationCapa', deviationCapaSchema);
