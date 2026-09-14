const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const inventorySnapshotSchema = new mongoose.Schema({
  dateString: { type: String, required: true, unique: true }, // Format: YYYY-MM-DD
  netRawMaterialValue: { type: Number, required: true },
  netFinishedGoodsValue: { type: Number, required: true },
  totalValuation: { type: Number, required: true },
}, { timestamps: true });

inventorySnapshotSchema.index({ dateString: 1 }, { unique: true });

inventorySnapshotSchema.plugin(tenantPlugin);
module.exports = mongoose.model('InventorySnapshot', inventorySnapshotSchema);
