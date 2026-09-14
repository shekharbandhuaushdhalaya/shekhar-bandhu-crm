const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const schemeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null },
  customerTypes: [{ type: String }],
  customerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  minQty: { type: Number, default: 1, min: 1 },
  freeQty: { type: Number, default: 0, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  maxApplicationsPerOrder: { type: Number, default: 0 },
  stackable: { type: Boolean, default: false },
  notes: { type: String, default: '' }
}, { timestamps: true });
schemeSchema.index({ firmId: 1, code: 1 }, { unique: true });
schemeSchema.index({ firmId: 1, active: 1, productId: 1, validFrom: 1, validUntil: 1 });
schemeSchema.plugin(tenantPlugin);
module.exports = mongoose.model('SalesScheme', schemeSchema);
