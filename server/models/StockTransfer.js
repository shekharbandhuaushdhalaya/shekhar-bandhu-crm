const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema({
  transferNo:        { type: String, unique: true },
  fromWarehouseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  fromWarehouseName: { type: String, default: '' },
  toWarehouseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  toWarehouseName:   { type: String, default: '' },
  items: [{
    productId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName:     { type: String, default: '' },
    qtyBoxes:        { type: Number, required: true },
    packing:         { type: Number, default: 1 },
    batchNo:         { type: String, default: '' }
  }],
  status:            { type: String, enum: ['pending', 'in_transit', 'completed', 'cancelled'], default: 'pending' },
  notes:             { type: String, default: '' },
  createdBy:         { type: String, default: '' },
  approvedBy:         { type: String, default: '' },
}, { timestamps: true });

stockTransferSchema.index({ transferNo: 1 });
stockTransferSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
