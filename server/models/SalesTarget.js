const mongoose = require('mongoose');

const salesTargetSchema = new mongoose.Schema({
  agentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agentName:   { type: String, required: true, trim: true },
  month:       { type: Number, required: true, min: 1, max: 12 },   // 1–12
  year:        { type: Number, required: true },
  targetAmount:{ type: Number, required: true, min: 0 },
  notes:       { type: String, default: '', trim: true },
}, { timestamps: true });

salesTargetSchema.index({ agentId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('SalesTarget', salesTargetSchema);
