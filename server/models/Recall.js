const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const affectedCustomerSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  invoiceNo: { type: String, required: true },
  invoiceDate: { type: Date },
  suppliedQty: { type: Number, required: true },
  notified: { type: Boolean, default: false },
  notifiedAt: { type: Date },
  notifiedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notifiedByName: { type: String, default: '' },
  notificationMethod: { type: String, enum: ['email', 'phone', 'letter', 'portal', 'other', ''], default: '' },
  notificationReference: { type: String, default: '', trim: true },
  notificationNotes: { type: String, default: '', trim: true }
}, { _id: false });

const recallSchema = new mongoose.Schema({
  recallNo: { type: String, required: true, unique: true, trim: true },
  batchNo: { type: String, required: true, trim: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true, trim: true },
  reason: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['class_I', 'class_II', 'class_III'], default: 'class_II' }, // Class I = Life Threatening, Class II = Temporary, Class III = Minor/Labeling
  affectedCustomers: [affectedCustomerSchema],
  totalAffectedQty: { type: Number, default: 0 },
  recalledQty: { type: Number, default: 0 },
  status: { type: String, enum: ['initiated', 'in_progress', 'completed', 'closed'], default: 'initiated' },
  initiatedBy: { type: String, default: 'System' },
  initiatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  statusUpdatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  statusUpdatedByName: { type: String, default: '' },
  statusUpdatedAt: { type: Date },
  closureNotes: { type: String, default: '' }
}, { timestamps: true });

recallSchema.index({ recallNo: 1, batchNo: 1 });

recallSchema.plugin(tenantPlugin);
module.exports = mongoose.model('Recall', recallSchema);
