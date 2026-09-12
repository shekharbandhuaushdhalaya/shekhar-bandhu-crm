const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const challanItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, default: 0 },
  rate: { type: Number, default: 0 },
  packing: { type: Number, default: 1 },
  hsnCode: { type: String, default: '' },
  gstRate: { type: Number, default: 0 },
  vendorId: { type: String, default: '', trim: true },
  vendorName: { type: String, default: '', trim: true },
  batchNo: { type: String, default: '', trim: true }
}, { _id: false });

const challanSchema = new mongoose.Schema({
  challanNo: { type: String, required: true, unique: true, trim: true },
  date: { type: Date, default: Date.now },
  partyName: { type: String, default: '', trim: true },
  partyAddress: { type: String, default: '', trim: true },
  partyCity: { type: String, default: '', trim: true },
  stateOfSupply: { type: String, default: '', trim: true },
  gstin: { type: String, default: '', trim: true },
  shippingAddress: { type: String, default: '', trim: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  warehouseName: { type: String, default: '', trim: true },
  // The Challan is the authoritative physical-goods document. For transfers, warehouseId is the source.
  challanType: { type: String, enum: ['sale', 'transfer', 'production_transfer'], default: 'sale' },
  destinationWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  destinationWarehouseName: { type: String, default: '', trim: true },
  sourceManufacturingUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManufacturingUnit', default: null },
  sourceManufacturingUnitName: { type: String, default: '', trim: true },
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  fulfillmentSequence: { type: Number, default: 1 },
  items: [challanItemSchema],
  status: { type: String, default: 'draft' },
  mode: { type: String, enum: ['regular', 'pakka', 'cash'], default: 'pakka' },
  baseAmount: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  nettTotal: { type: Number, default: 0 },
  convertedToInvoice: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNo: { type: String, default: '' },
  deductInventory: { type: Boolean, default: true },
  inventoryPostedAt: { type: Date, default: null },
  inventoryPostedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  inventoryTransactionId: { type: String, default: undefined, trim: true },
  inventoryPostingStatus: { type: String, enum: ['not_posted', 'posting', 'posted', 'reversed'], default: 'not_posted' },
  inventoryReversedAt: { type: Date, default: null },
  inventoryReversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reversalChallanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challan', default: null },
  supportingDocuments: [
    {
      name: { type: String, required: true },
      url: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

challanSchema.index({ challanNo: 'text', partyName: 'text', status: 'text' });
challanSchema.index({ createdAt: -1 });
challanSchema.index({ challanType: 1, destinationWarehouseId: 1, createdAt: -1 });
challanSchema.index({ inventoryTransactionId: 1 }, { unique: true, sparse: true });
challanSchema.index({ firmId: 1, challanType: 1, status: 1, date: -1 });
challanSchema.index({ firmId: 1, salesOrderId: 1, fulfillmentSequence: 1 });

challanSchema.plugin(tenantPlugin);
module.exports = mongoose.model('Challan', challanSchema);
