const mongoose = require('mongoose');

const batchProductionSchema = new mongoose.Schema({
  batchNo: { type: String, required: true, unique: true, trim: true },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  plannedQty: { type: Number, required: true }, // planned output units
  actualYieldQty: { type: Number, default: 0 }, // actual output units after QC
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'qc_hold', 'completed', 'cancelled'],
    default: 'draft',
  },
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
      batchNo: { type: String, required: true }, // raw material batch number
    }
  ],
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  qcNotes: { type: String, default: '' },
  qcPassedBy: { type: String, default: '' },
  rawMaterialCost: { type: Number, default: 0 },
  unitProductionCost: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('BatchProduction', batchProductionSchema);
