const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');

const certificateOfAnalysisSchema = new mongoose.Schema({
  coaNumber: { type: String, required: true, unique: true },
  batchNo: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  manufacturingLicenseNo: { type: String, default: '' },
  gmpCertificateNo: { type: String, default: '' },
  pharmacopoeialStandard: { type: String, default: '' },
  specificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductQualitySpecification', default: null },
  specificationVersion: { type: String, default: '' },
  specificationSource: { type: String, default: '' },
  dosageForm: { type: String, default: 'Churna / Herbal Formulation' },
  manufacturingDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  testingDate: { type: Date, default: Date.now },
  sampleQuantityTested: { type: String, default: '' },
  organolepticTests: {
    color: { type: String, default: '' },
    odor: { type: String, default: '' },
    taste: { type: String, default: '' },
    appearance: { type: String, default: '' },
    passed: { type: Boolean, default: false }
  },
  physicochemicalTests: {
    lossOnDryingPercent: { type: Number, default: null }, // Max 10.0% w/w
    lossOnDryingLimit: { type: String, default: 'NMT 10.0% w/w' },
    totalAshPercent: { type: Number, default: null }, // Max 5.0% w/w
    totalAshLimit: { type: String, default: 'NMT 5.0% w/w' },
    acidInsolubleAshPercent: { type: Number, default: null }, // Max 1.0% w/w
    acidInsolubleAshLimit: { type: String, default: 'NMT 1.0% w/w' },
    alcoholSolubleExtractivePercent: { type: Number, default: null },
    waterSolubleExtractivePercent: { type: Number, default: null },
    phValue: { type: Number, default: null },
    phLimit: { type: String, default: '4.0 - 7.0' },
    disintegrationTimeMinutes: { type: Number, default: null }, // Max 30 mins for tablets
    disintegrationLimit: { type: String, default: 'NMT 30 mins' },
    specificGravity: { type: Number, default: null },
    brix: { type: Number, default: null },
    passed: { type: Boolean, default: false }
  },
  heavyMetalTests: {
    leadPpm: { type: Number, default: null }, // Max 10.0 ppm permissible (AYUSH Gazette)
    cadmiumPpm: { type: Number, default: null }, // Max 0.3 ppm
    mercuryPpm: { type: Number, default: null }, // Max 1.0 ppm
    arsenicPpm: { type: Number, default: null }, // Max 3.0 ppm
    passed: { type: Boolean, default: false }
  },
  microbialTests: {
    totalPlateCountCfu: { type: Number, default: null }, // Max 10^5 CFU/g (AYUSH API limit)
    totalPlateCountLimit: { type: String, default: 'NMT 10^5 CFU/g' },
    yeastMoldCfu: { type: Number, default: null }, // Max 10^3 CFU/g
    yeastMoldLimit: { type: String, default: 'NMT 10^3 CFU/g' },
    eColi: { type: String, default: '' },
    salmonella: { type: String, default: '' },
    staphylococcusAureus: { type: String, default: '' },
    pseudomonasAeruginosa: { type: String, default: '' },
    passed: { type: Boolean, default: false }
  },
  aflatoxinsAndPesticides: {
    aflatoxins: { type: String, default: '' },
    pesticideResidues: { type: String, default: '' },
    passed: { type: Boolean, default: false }
  },
  overallResult: { type: String, enum: ['APPROVED', 'REJECTED', 'PENDING'], default: 'PENDING' },
  status: { type: String, enum: ['draft', 'approved', 'rejected'], default: 'draft', index: true },
  testedBy: { type: String, required: true },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date },
  remarks: { type: String, default: '' },
  tests: [{
    code: { type: String, required: true }, name: { type: String, required: true }, category: String,
    specification: String, unit: String, methodReference: String, result: String, numericResult: Number,
    status: { type: String, enum: ['not_tested','pending','pass','fail'], default: 'not_tested' },
    testedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, testedByName: String, testedAt: Date, remarks: String
  }],
  qcCompleted: { type: Boolean, default: false },
  qaReviewedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qaReviewedByName: { type: String, default: '' }
}, { timestamps: true });

certificateOfAnalysisSchema.plugin(tenantPlugin);
module.exports = mongoose.model('CertificateOfAnalysis', certificateOfAnalysisSchema);
