const mongoose = require('mongoose');

const rawMaterialQuarantineSchema = new mongoose.Schema({
  quarantineLotNo: { type: String, required: true, unique: true },
  herbName: { type: String, required: true, index: true },
  botanicalName: { type: String, default: '' },
  batchNo: { type: String, required: true, index: true },
  supplierName: { type: String, default: 'Herbal Vendor' },
  qty: { type: Number, required: true },
  unit: { type: String, default: 'kg' },
  receivedDate: { type: Date, default: Date.now },
  quarantineStatus: {
    type: String,
    enum: ['under_testing', 'released', 'rejected'],
    default: 'under_testing',
    index: true,
  },
  testReportNo: { type: String, default: '' },
  testingDate: { type: Date },
  expiryDate: { type: Date, required: true, index: true },
  testedBy: { type: String, default: '' },
  releasedBy: { type: String, default: '' },
  remarks: { type: String, default: '' },
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', default: null },
  rawMaterialEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialEntry', default: null },
}, { timestamps: true });

module.exports = mongoose.model('RawMaterialQuarantine', rawMaterialQuarantineSchema);
