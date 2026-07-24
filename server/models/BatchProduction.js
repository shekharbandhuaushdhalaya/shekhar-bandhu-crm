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
    enum: ['pending', 'in_progress', 'completed', 'skipped', 'failed'],
    default: 'pending'
  },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  completedBy: { type: String, default: '' },
  notes: { type: String, default: '' },
  targetDurationDays: { type: Number, default: 1 },
  targetCompletionDate: { type: Date, default: null }
}, { _id: false });

const batchProductionSchema = new mongoose.Schema({
  batchNo: { type: String, required: true, unique: true, trim: true },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  manufacturingUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManufacturingUnit',
    required: true,
  },
  manufacturingUnitName: { type: String, default: '' },
  plannedQty: { type: Number, required: true },
  actualYieldQty: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'qc_hold', 'completed', 'cancelled', 'rejected'],
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
  packagingDeducted: { type: Boolean, default: false },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  qcNotes: { type: String, default: '' },
  qcPassedBy: { type: String, default: '' },
  qcStatus: { type: String, enum: ['approved', 'rejected'], default: 'approved' },
  qcParameters: {
    organoleptic: { type: String, default: '' },
    moistureContent: { type: Number, default: null },
    ashValue: { type: Number, default: null },
    pHValue: { type: Number, default: null },
    disintegrationTime: { type: Number, default: null },
    heavyMetals: { type: String, default: '' },
    microbialLimit: { type: String, default: '' },
    labReportRef: { type: String, default: '' }
  },
  rawMaterialCost: { type: Number, default: 0 },
  overheadCost: { type: Number, default: 0 },
  unitProductionCost: { type: Number, default: 0 },
  productionType: {
    type: String,
    enum: ['in_house', 'job_work'],
    default: 'in_house'
  },
  jobWorkMode: {
    type: String,
    enum: ['raw_materials_supplied', 'direct_purchase', 'none'],
    default: 'none'
  },
  packagingMode: {
    type: String,
    enum: ['packed_by_vendor', 'self_packed'],
    default: 'packed_by_vendor'
  },
  jobWorkerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  jobWorkerName: { type: String, default: '' },
  jobWorkerChallanRef: { type: String, default: '' }, // Outward delivery challan reference
  jobWorkerCertificateRef: { type: String, default: '' }, // Job Worker Batch Certificate number
  coaDocumentRef: { type: String, default: '' }, // Certificate of Analysis uploaded reference
  jobWorkCharges: { type: Number, default: 0 }, // Billable service charges for outsourcing
  supportingDocuments: [
    {
      name: { type: String, required: true },
      url: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

batchProductionSchema.index({ 'ingredientsConsumed.rawMaterialEntryId': 1 });

const BatchProduction = mongoose.model('BatchProduction', batchProductionSchema);
module.exports = BatchProduction;
module.exports.MANUFACTURING_STAGES = MANUFACTURING_STAGES;
