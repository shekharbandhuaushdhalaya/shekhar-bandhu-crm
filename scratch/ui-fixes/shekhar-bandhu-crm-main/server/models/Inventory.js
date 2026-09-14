const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const inventorySchema = new mongoose.Schema({
  warehouse: { type: String, default: '', trim: true },
  itemSku: { type: String, required: true, trim: true },
  itemName: { type: String, required: true, trim: true },
  qty: { type: Number, default: 0 },
  minReorder: { type: Number, default: 5 },
  val: { type: Number, default: 0 }
}, { timestamps: true });

inventorySchema.index({ warehouse: 'text', itemSku: 'text', itemName: 'text' });

inventorySchema.plugin(tenantPlugin);
module.exports = mongoose.model('Inventory', inventorySchema);
