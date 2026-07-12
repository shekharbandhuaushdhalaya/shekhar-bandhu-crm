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
      qtyRequired: { type: Number, required: true }, // qty required of raw material
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model('BillOfMaterials', billOfMaterialsSchema);
