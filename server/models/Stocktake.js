const mongoose = require('mongoose');

const stocktakeItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  batchNo: { type: String, default: '' },
  expectedQty: { type: Number, required: true, default: 0 },
  countedQty: { type: Number, required: true, default: 0 },
  varianceQty: { type: Number, required: true, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const stocktakeSchema = new mongoose.Schema({
  stocktakeNo: { type: String, required: true, unique: true, trim: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  warehouseName: { type: String, required: true, trim: true },
  date: { type: Date, default: Date.now },
  items: [stocktakeItemSchema],
  totalVarianceBoxes: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'completed', 'cancelled'], default: 'draft' },
  performedBy: { type: String, default: 'System' },
  notes: { type: String, default: '' }
}, { timestamps: true });

stocktakeSchema.index({ stocktakeNo: 1, warehouseId: 1 });

module.exports = mongoose.model('Stocktake', stocktakeSchema);
