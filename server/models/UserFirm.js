const mongoose = require('mongoose');
const userFirmSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
  role: { type: String, default: 'agent', trim: true },
  permissions: { type: [String], default: [] },
  isDefault: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  lastSelectedAt: { type: Date, default: null }
}, { timestamps: true });
userFirmSchema.index({ userId: 1, firmId: 1 }, { unique: true });
userFirmSchema.index({ userId: 1, isDefault: 1 });
module.exports = mongoose.model('UserFirm', userFirmSchema);
