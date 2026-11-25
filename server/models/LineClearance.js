const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const lineClearanceSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', required: true },
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  phase: { type: String, enum: ['manufacturing','filling','packing'], default: 'manufacturing', index: true },
  cleared: { type: Boolean, default: false },
  previousBatchNo: { type: String, default: '', trim: true },
  checklist: {
    equipmentCleaned: { type: Boolean, default: false },
    previousMaterialsRemoved: { type: Boolean, default: false },
    previousLabelsDocumentsRemoved: { type: Boolean, default: false },
    areaVisuallyInspected: { type: Boolean, default: false }
  },
  notes: { type: String, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedByName: { type: String, default: '' },
  submittedAt: { type: Date, default: null },
  clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  clearedByName: { type: String, default: '' },
  clearedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedByName: { type: String, default: '' },
  verifiedAt: { type: Date, default: null }
}, { timestamps: true });

lineClearanceSchema.index({ batchId: 1, phase: 1 }, { unique: true });

lineClearanceSchema.plugin(tenantPlugin);
module.exports = mongoose.model('LineClearance', lineClearanceSchema);
