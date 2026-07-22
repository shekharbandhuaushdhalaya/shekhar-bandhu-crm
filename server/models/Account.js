const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  isActive: { type: Boolean, default: true },
  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Account', accountSchema);
