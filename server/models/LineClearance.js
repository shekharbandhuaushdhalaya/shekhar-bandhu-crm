const mongoose = require('mongoose');

const lineClearanceSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', required: true },
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  previousBatchNo: { type: String, default: '', trim: true },
  checklist: {
    equipmentCleaned: { type: Boolean, default: false },
    previousMaterialsRemoved: { type: Boolean, default: false },
    previousLabelsDocumentsRemoved: { type: Boolean, default: false },
    areaVisuallyInspected: { type: Boolean, default: false }
  },
  notes: { type: String, default: '' },
  clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clearedByName: { type: String, default: '' },
  clearedAt: { type: Date, default: Date.now }
}, { timestamps: true });

lineClearanceSchema.index({ batchId: 1 }, { unique: true });

module.exports = mongoose.model('LineClearance', lineClearanceSchema);
