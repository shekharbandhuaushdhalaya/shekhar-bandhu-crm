const mongoose = require('mongoose');

const productionPlanSchema = new mongoose.Schema({
  planNo: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  manufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction' }],
  status: {
    type: String,
    enum: ['draft', 'approved', 'in_execution', 'completed', 'cancelled'],
    default: 'draft'
  },
  notes: { type: String, default: '', trim: true },
  createdBy: { type: String, default: 'System' }
}, { timestamps: true });

productionPlanSchema.index({ planNo: 'text', name: 'text', status: 'text' });

module.exports = mongoose.model('ProductionPlan', productionPlanSchema);
