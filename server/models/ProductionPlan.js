const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const plannedBatchSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  plannedQty: { type: Number, required: true, min: 1 },
  targetBatchNo: { type: String, default: '' },
  estimatedDays: { type: Number, default: 7 },
  bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillOfMaterials', required: true },
  bomSnapshot: {
    recipeName: { type: String, required: true },
    recipeUpdatedAt: { type: Date, required: true },
    formulationBasis: { type: Number, required: true, min: 0.000001 },
    formulationBasisUnit: { type: String, default: '' },
    formulationStandardRef: { type: String, default: '' },
    ingredients: [{ rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true }, qtyRequired: { type: Number, required: true, min: 0 }, itemType: { type: String, default: 'formulation' }, stageName: { type: String, default: '' }, isPrintedMaterial: { type: Boolean, default: false } }],
    stages: [{ name: String, targetDurationHours: Number }],
    overheadCost: { type: Number, default: 0 }
  }
}, { _id: false });

const productionPlanSchema = new mongoose.Schema({
  planNo: { type: String, required: true, unique: true, trim: true },
  title: { type: String, required: true, trim: true },
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  manufacturingUnitName: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction' }],
  plannedBatches: [plannedBatchSchema],
  rawMaterialSufficiencyStatus: {
    type: String,
    enum: ['sufficient', 'shortage_detected', 'not_checked'],
    default: 'not_checked'
  },
  shortageDetails: [{ rawMaterialName: String, requiredQty: Number, availableQty: Number, shortageQty: Number }],
  materialReservations: [{ rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true }, rawMaterialEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialEntry', required: true }, batchNo: { type: String, default: '' }, qty: { type: Number, required: true, min: 0 } }],
  status: {
    type: String,
    enum: ['draft', 'approved', 'in_production', 'completed', 'cancelled'],
    default: 'draft'
  },
  plannerName: { type: String, default: 'System' },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  notes: { type: String, default: '' }
}, { timestamps: true });

productionPlanSchema.index({ planNo: 1, startDate: 1, manufacturingUnitId: 1 });

productionPlanSchema.plugin(tenantPlugin);
module.exports = mongoose.model('ProductionPlan', productionPlanSchema);
