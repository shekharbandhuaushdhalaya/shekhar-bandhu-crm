const mongoose = require('mongoose');

const certificateOfAnalysisSchema = new mongoose.Schema({
  coaNumber: { type: String, required: true, unique: true },
  batchNo: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  manufacturingLicenseNo: { type: String, default: 'AYUSH-1983-UP' },
  gmpCertificateNo: { type: String, default: 'GMP-AYUSH-2026-VNS' },
  pharmacopoeialStandard: { type: String, enum: ['API', 'AFI', 'IP', 'BP', 'USP', 'House Standard'], default: 'API' },
  dosageForm: { type: String, default: 'Churna / Herbal Formulation' },
  manufacturingDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  testingDate: { type: Date, default: Date.now },
  sampleQuantityTested: { type: String, default: '100g' },
  organolepticTests: {
    color: { type: String, default: 'Characteristic Dark Brown' },
    odor: { type: String, default: 'Aromatic Herbal' },
    taste: { type: String, default: 'Katu-Tikta (Bitter-Pungent)' },
    appearance: { type: String, default: 'Uniform Fine Powder / Clear Solution' },
    passed: { type: Boolean, default: true }
  },
  physicochemicalTests: {
    lossOnDryingPercent: { type: Number, default: 4.2 }, // Max 10.0% w/w
    lossOnDryingLimit: { type: String, default: 'NMT 10.0% w/w' },
    totalAshPercent: { type: Number, default: 2.8 }, // Max 5.0% w/w
    totalAshLimit: { type: String, default: 'NMT 5.0% w/w' },
    acidInsolubleAshPercent: { type: Number, default: 0.4 }, // Max 1.0% w/w
    acidInsolubleAshLimit: { type: String, default: 'NMT 1.0% w/w' },
    alcoholSolubleExtractivePercent: { type: Number, default: 18.5 },
    waterSolubleExtractivePercent: { type: Number, default: 24.0 },
    phValue: { type: Number, default: 5.2 },
    phLimit: { type: String, default: '4.0 - 7.0' },
    disintegrationTimeMinutes: { type: Number, default: 12 }, // Max 30 mins for tablets
    disintegrationLimit: { type: String, default: 'NMT 30 mins' },
    specificGravity: { type: Number, default: null },
    brix: { type: Number, default: null },
    passed: { type: Boolean, default: true }
  },
  heavyMetalTests: {
    leadPpm: { type: Number, default: 0.1 }, // Max 10.0 ppm permissible (AYUSH Gazette)
    cadmiumPpm: { type: Number, default: 0.02 }, // Max 0.3 ppm
    mercuryPpm: { type: Number, default: 0.01 }, // Max 1.0 ppm
    arsenicPpm: { type: Number, default: 0.05 }, // Max 3.0 ppm
    passed: { type: Boolean, default: true }
  },
  microbialTests: {
    totalPlateCountCfu: { type: Number, default: 100 }, // Max 10^5 CFU/g (AYUSH API limit)
    totalPlateCountLimit: { type: String, default: 'NMT 10^5 CFU/g' },
    yeastMoldCfu: { type: Number, default: 10 }, // Max 10^3 CFU/g
    yeastMoldLimit: { type: String, default: 'NMT 10^3 CFU/g' },
    eColi: { type: String, default: 'Absent in 1g' },
    salmonella: { type: String, default: 'Absent in 10g' },
    staphylococcusAureus: { type: String, default: 'Absent in 1g' },
    pseudomonasAeruginosa: { type: String, default: 'Absent in 1g' },
    passed: { type: Boolean, default: true }
  },
  aflatoxinsAndPesticides: {
    aflatoxins: { type: String, default: 'Complies with API Limits (B1,B2,G1,G2 < 0.5 ppb)' },
    pesticideResidues: { type: String, default: 'Complies with API Limits' },
    passed: { type: Boolean, default: true }
  },
  overallResult: { type: String, enum: ['APPROVED', 'REJECTED', 'PENDING'], default: 'APPROVED' },
  status: { type: String, enum: ['draft', 'approved', 'rejected'], default: 'draft', index: true },
  testedBy: { type: String, required: true },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date },
  remarks: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('CertificateOfAnalysis', certificateOfAnalysisSchema);
