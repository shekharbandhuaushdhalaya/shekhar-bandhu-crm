const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const schema = new mongoose.Schema({
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseName: { type: String, default: '' },
  type: { type: String, enum: ['IN', 'OUT', 'ADJUSTMENT'], required: true },
  qty: { type: Number, required: true },
  balance: { type: Number, required: true },
  reference: { type: String, default: '' },
  note: { type: String, default: '' },
  batchNo: { type: String, default: '' },
  movementKey: { type: String, default: undefined },
  createdBy: { type: String, default: '' },
}, { timestamps: true });

schema.index({ rawMaterialId: 1, warehouseId: 1, createdAt: -1 });
schema.index({ movementKey: 1 }, { unique: true, sparse: true });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('RawMaterialLedger', schema);
