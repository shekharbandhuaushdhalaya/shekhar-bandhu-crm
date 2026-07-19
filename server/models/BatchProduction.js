const mongoose = require('mongoose');

const MANUFACTURING_STAGES = [
  'Raw Material Verification & Weighing',
  'Primary Processing (Swasan/Mardan)',
  'Mixing & Blending',
  'Forming (Vati/Gutika)',
  'Drying',
  'QC Testing',
  'Packaging & Labeling'
];

const stageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending'
  },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  completedBy: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { _id: false });

const batchProductionSchema = new mongoose.Schema({
  batchNo: { type: String, required: true, unique: true, trim: true },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  plannedQty: { type: Number, required: true },
  actualYieldQty: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'qc_hold', 'completed', 'cancelled'],
    default: 'draft',
  },
  stages: { type: [stageSchema], default: () => MANUFACTURING_STAGES.map(name => ({ name, status: 'pending' })) },
  wasteQty: { type: Number, default: 0 },
  wasteReason: { type: String, default: '' },
  variancePercent: { type: Number, default: 0 },
  ingredientsConsumed: [
    {
      rawMaterialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawMaterial',
        required: true,
      },
      rawMaterialEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawMaterialEntry',
        required: true,
      },
      qtyConsumed: { type: Number, required: true },
      batchNo: { type: String, required: true },
    }
  ],
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  qcNotes: { type: String, default: '' },
  qcPassedBy: { type: String, default: '' },
  rawMaterialCost: { type: Number, default: 0 },
  unitProductionCost: { type: Number, default: 0 },
}, { timestamps: true });

batchProductionSchema.index({ 'ingredientsConsumed.rawMaterialEntryId': 1 });

const BatchProduction = mongoose.model('BatchProduction', batchProductionSchema);
module.exports = BatchProduction;
module.exports.MANUFACTURING_STAGES = MANUFACTURING_STAGES;
