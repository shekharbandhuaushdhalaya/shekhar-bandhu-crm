const mongoose = require('mongoose');

const plannedBatchSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  plannedQty: { type: Number, required: true, min: 1 },
  targetBatchNo: { type: String, default: '' },
  estimatedDays: { type: Number, default: 7 }
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
  status: {
    type: String,
    enum: ['draft', 'approved', 'in_production', 'completed', 'cancelled'],
    default: 'draft'
  },
  plannerName: { type: String, default: 'System' },
  notes: { type: String, default: '' }
}, { timestamps: true });

productionPlanSchema.index({ planNo: 1, startDate: 1, manufacturingUnitId: 1 });

module.exports = mongoose.model('ProductionPlan', productionPlanSchema);
