const mongoose = require('mongoose');

const affectedCustomerSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  invoiceNo: { type: String, required: true },
  invoiceDate: { type: Date },
  suppliedQty: { type: Number, required: true },
  notified: { type: Boolean, default: false },
  notifiedAt: { type: Date }
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
  closureNotes: { type: String, default: '' }
}, { timestamps: true });

recallSchema.index({ recallNo: 1, batchNo: 1 });

module.exports = mongoose.model('Recall', recallSchema);
