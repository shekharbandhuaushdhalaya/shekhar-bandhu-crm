const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const testSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['organoleptic','physicochemical','assay','identity','microbial','heavy_metals','aflatoxin','pesticide','other'], default: 'other' },
  specification: { type: String, required: true, trim: true },
  unit: { type: String, default: '' },
  methodReference: { type: String, default: '' },
  mandatory: { type: Boolean, default: true }
}, { _id: false });

const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  systemOfMedicine: { type: String, enum: ['Ayurveda','Siddha','Unani','Homoeopathy','Other'], default: 'Ayurveda' },
  dosageForm: { type: String, required: true, trim: true },
  pharmacopoeialStandard: { type: String, required: true, trim: true },
  monographReference: { type: String, default: '' },
  specificationVersion: { type: String, required: true, trim: true },
  effectiveDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['draft','approved','superseded'], default: 'draft', index: true },
  tests: { type: [testSchema], default: [] },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  sourceNote: { type: String, default: '' }
}, { timestamps: true });

schema.index({ productId: 1, status: 1, effectiveDate: -1 });
schema.plugin(tenantPlugin);
module.exports = mongoose.model('ProductQualitySpecification', schema);
