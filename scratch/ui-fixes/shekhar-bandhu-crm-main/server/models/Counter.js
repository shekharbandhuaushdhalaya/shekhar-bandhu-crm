const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

/**
 * Tenant-scoped atomic sequence counter.
 *
 * Do NOT use the business counter name as MongoDB `_id`: `_id` is globally unique
 * across the collection and would therefore make `invoiceNo`, `challanNo`, etc.
 * collide between firms. `counterKey` is instead unique within a firm through the
 * tenant plugin's compound unique-index conversion.
 */
const counterSchema = new mongoose.Schema({
  counterKey: { type: String, required: true, trim: true },
  seq: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

counterSchema.index({ counterKey: 1 }, { unique: true });
counterSchema.plugin(tenantPlugin);

module.exports = mongoose.model('Counter', counterSchema);
