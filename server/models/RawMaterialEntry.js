const mongoose = require('mongoose');

const rawMaterialEntrySchema = new mongoose.Schema({
  rawMaterialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawMaterial',
    required: true,
  },
  batchNo: { type: String, required: true, trim: true }, // vendor batch number
  qty: { type: Number, required: true, default: 0 }, // remaining stock in kg/l/units
  purchaseRate: { type: Number, required: true, default: 0 },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },
  vendorName: { type: String, default: '' },
  expiryDate: { type: Date, default: null },
  purchaseRef: { type: String, default: '' },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
  },
  warehouseName: { type: String, default: '' },
}, { timestamps: true });

rawMaterialEntrySchema.index({ rawMaterialId: 1, batchNo: 1 }, { unique: true });

module.exports = mongoose.model('RawMaterialEntry', rawMaterialEntrySchema);
