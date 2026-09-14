const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

// Public ratings are anonymous by design, but a salted daily fingerprint makes
// repeated submissions from the same client non-amplifying. The aggregate on
// Product is updated only after this unique write succeeds.
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  fingerprint: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ productId: 1, fingerprint: 1 }, { unique: true });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('ProductRating', schema);
