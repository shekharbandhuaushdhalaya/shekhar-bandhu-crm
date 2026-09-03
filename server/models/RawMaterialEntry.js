const mongoose = require('mongoose');

const rawMaterialEntrySchema = new mongoose.Schema({
  rawMaterialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RawMaterial',
    required: true,
  },
  batchNo: { type: String, required: true, trim: true }, // vendor batch number
  initialQty: { type: Number, default: 0 }, // original inward qty from purchase bill
  qty: { type: Number, required: true, default: 0 }, // current remaining available stock
  reservedQty: { type: Number, default: 0 }, // quantity reserved for in-progress production runs
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
  // Cleaning / pre-processing loss tracking
  cleanedQty: { type: Number, default: 0 },           // qty after cleaning (0 = not yet cleaned)
  cleaningLoss: { type: Number, default: 0 },          // actual weight lost during cleaning
  cleaningLossPercent: { type: Number, default: 0 },   // actual loss % for this batch
  cleaningDate: { type: Date, default: null },
  cleaningNotes: { type: String, default: '' },
  qcStatus: { type: String, enum: ['under_test', 'approved', 'rejected'], default: 'under_test' },
}, { timestamps: true });

rawMaterialEntrySchema.index({ rawMaterialId: 1, batchNo: 1 }, { unique: true });
rawMaterialEntrySchema.index({ rawMaterialId: 1, warehouseId: 1, expiryDate: 1, createdAt: 1 });

module.exports = mongoose.model('RawMaterialEntry', rawMaterialEntrySchema);
