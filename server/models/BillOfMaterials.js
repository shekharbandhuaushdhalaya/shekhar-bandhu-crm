const mongoose = require('mongoose');

const billOfMaterialsSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true,
  },
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
  stages: [
    {
      name: { type: String, required: true },
      targetDurationDays: { type: Number, required: true, default: 1 }
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model('BillOfMaterials', billOfMaterialsSchema);
