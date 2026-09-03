const mongoose = require('mongoose');

const billOfMaterialsSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  recipeName: { type: String, required: true, default: 'Standard Recipe', trim: true },
  isDefault: { type: Boolean, default: false },
  batchYieldSize: { type: Number, required: true, default: 100 }, // standard/reference batch size (e.g. 100 bottles) — informational only; formulation ingredient scaling always uses a fixed per-100-output-unit basis, not this value
  ingredients: [
    {
      rawMaterialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawMaterial',
        required: true,
      },
      qtyRequired: { type: Number, required: true }, // formulation: qty required per 100 output units (100 Liter/100 Kg/100 pieces), fixed basis, independent of batchYieldSize; packaging: pcs/unit
      itemType: { type: String, enum: ['formulation', 'packaging'], default: 'formulation' },
      stageName: { type: String, default: '', trim: true }, // which manufacturing stage consumes this (empty = consumed at batch start)
    }
  ],
  isActive: { type: Boolean, default: true },
  productionNotes: { type: String, default: "" },
  formulationStandardRef: { type: String, default: '', trim: true }, // e.g. "As per API Part I, Vol IV"
  overheadCost: { type: Number, default: 0 },
  formulationBasis: { type: Number, default: 100, min: 1 }, // qty standard: e.g. 10 (10L), 100 (100ml), 10 (10 pcs)
  formulationBasisUnit: { type: String, default: 'ml', trim: true }, // unit of the basis: 'ml', 'L', 'g', 'kg', 'pcs', 'caps'
  defaultProductionType: { type: String, enum: ['in_house', 'job_work'], default: 'in_house' },
  defaultJobWorkMode: { type: String, enum: ['raw_materials_supplied', 'direct_purchase', 'none'], default: 'none' },
  defaultPackagingMode: { type: String, enum: ['packed_by_vendor', 'self_packed'], default: 'self_packed' },
  defaultJobWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  stages: [
    {
      name: { type: String, required: true },
      targetDurationHours: { type: Number, required: true, default: 8 }  // duration in hours
    }
  ],
}, { timestamps: true });

billOfMaterialsSchema.index({ productId: 1, recipeName: 1 }, { unique: true });

module.exports = mongoose.model('BillOfMaterials', billOfMaterialsSchema);