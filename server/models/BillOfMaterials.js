const mongoose = require('mongoose');

const billOfMaterialsSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  recipeName: { type: String, required: true, default: 'Standard Recipe', trim: true },
  isDefault: { type: Boolean, default: false },
  batchYieldSize: { type: Number, required: true, default: 1 }, // standard size of output batch (e.g. 100 bottles)
  ingredients: [
    {
      rawMaterialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawMaterial',
        required: true,
      },
      qtyRequired: { type: Number, required: true }, // qty required (% for formulation, pcs/unit for packaging)
      itemType: { type: String, enum: ['formulation', 'packaging'], default: 'formulation' },
    }
  ],
  isActive: { type: Boolean, default: true },
  productionNotes: { type: String, default: "" },
  overheadCost: { type: Number, default: 0 },
  defaultProductionType: { type: String, enum: ['in_house', 'job_work'], default: 'in_house' },
  defaultJobWorkMode: { type: String, enum: ['raw_materials_supplied', 'direct_purchase', 'none'], default: 'none' },
  defaultPackagingMode: { type: String, enum: ['packed_by_vendor', 'self_packed'], default: 'self_packed' },
  defaultJobWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  stages: [
    {
      name: { type: String, required: true },
      targetDurationDays: { type: Number, required: true, default: 1 }
    }
  ],
}, { timestamps: true });

billOfMaterialsSchema.index({ productId: 1, recipeName: 1 }, { unique: true });

module.exports = mongoose.model('BillOfMaterials', billOfMaterialsSchema);
