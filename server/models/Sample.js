const mongoose = require('mongoose');

const sampleItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true, trim: true },
  qty:         { type: Number, required: true, min: 1 },
  size:        { type: String, default: '' },
  mrp:         { type: Number, default: 0 }
}, { _id: false });

const sampleSchema = new mongoose.Schema({
  sampleNo:    { type: String, required: true, unique: true, trim: true },
  givenTo:     { type: String, required: true, trim: true },
  designation: { type: String, default: '', trim: true },      // e.g. Doctor, Distributor
  phone:       { type: String, default: '', trim: true },
  location:    { type: String, default: '', trim: true },
  purpose:     { type: String, default: '', trim: true },       // e.g. Demo, Trial
  items:       [sampleItemSchema],
  totalMrpValue: { type: Number, default: 0 },
  givenBy:     { type: String, default: '', trim: true },       // agent/staff name
  date:        { type: Date, default: Date.now },
  followUpDate:{ type: Date },
  notes:       { type: String, default: '', trim: true },
  status:      { type: String, enum: ['given', 'follow_up_done', 'converted', 'no_response'], default: 'given' },
}, { timestamps: true });

sampleSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Sample', sampleSchema);
