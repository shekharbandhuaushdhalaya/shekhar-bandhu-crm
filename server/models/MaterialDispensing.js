const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const dispensingItemSchema = new mongoose.Schema({
  rawMaterialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  rawMaterialEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialEntry', required: true },
  materialName: { type: String, default: '' },
  lotNo: { type: String, required: true, trim: true },
  qtyDispensed: { type: Number, required: true, min: 0.0001 },
  qtyWasted: { type: Number, default: 0, min: 0 },
  wastageReason: { type: String, default: '', trim: true },
  unit: { type: String, required: true, trim: true }
}, { _id: false });

dispensingItemSchema.pre('validate', function(next) {
  const wasted = Number(this.qtyWasted || 0);
  const dispensed = Number(this.qtyDispensed || 0);
  if (!Number.isFinite(wasted) || wasted < 0 || wasted > dispensed) {
    return next(new Error('Recorded dispensing wastage must be non-negative and cannot exceed the weighed quantity'));
  }
  if (wasted > 0 && !String(this.wastageReason || '').trim()) {
    return next(new Error('A documented reason is required for recorded dispensing wastage'));
  }
  return next();
});

const schema = new mongoose.Schema({
  dispensingNo: { type: String, required: true, unique: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BatchProduction', required: true, index: true },
  batchNo: { type: String, required: true, trim: true },
  stageIndex: { type: Number, required: true, min: 0 },
  stageName: { type: String, required: true, trim: true },
  items: { type: [dispensingItemSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 },
  status: { type: String, enum: ['pending_verification', 'verified', 'rejected'], default: 'pending_verification', index: true },
  dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dispensedByName: { type: String, required: true, trim: true },
  dispensedAt: { type: Date, required: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedByName: { type: String, default: '' },
  verifiedAt: { type: Date, default: null },
  verificationNotes: { type: String, default: '' }
}, { timestamps: true });

schema.index({ batchId: 1, stageIndex: 1, status: 1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('MaterialDispensing', schema);
