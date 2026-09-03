const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'company_config', unique: true },
  firmName: { type: String, default: "SHEKHAR BANDHU AUSHADHALAYA" },
  firmAddress: { type: String, default: "PILIKOTHI, VARANASI (U.P.)" },
  firmEmail: { type: String, default: "info@shekharbandhuaushadhalaya.in" },
  firmPhone: { type: String, default: "+91-9450371661" },
  firmGstin: { type: String, default: "09ABKFS1983L1Z4" },
  bankName: { type: String, default: "Bank of India" },
  bankAccountNo: { type: String, default: "691527110000080" },
  bankIfsc: { type: String, default: "BKID0006915" },
  bankBranch: { type: String, default: "Lohatiya, Varanasi" },
  bankUpi: { type: String, default: "" },
  invoicePrefix: { type: String, default: "SB" },
  quotationPrefix: { type: String, default: "QT" },
  challanPrefix: { type: String, default: "CH" },
  dispatchPrefix: { type: String, default: "DP" },
  defaultTerms: {
    type: String,
    default: `1. All disputes are subject to "VARANASI" Jurisdiction only.\n2. Goods despatched at your risk and responsibility. Kindly retire the documents on presentation.\n3. We do not accept any responsibility for any loss/damages once the goods are delivered to the carriers.\n4. Interest @ 18% p.a. will be charged if the payment is not made within the stipulated time.\n5. Goods once sold will not be taken back.`
  },
  defaultGstRate: { type: Number, default: 18 },
  signatureBase64: { type: String, default: '' },
  signatureUrl: { type: String, default: '' },
  dscSignatoryName: { type: String, default: 'Authorised Representative' },
  dscCertificateName: { type: String, default: 'eMudhra / Class 3 DSC' },
  paymentGatewayEnabled: { type: Boolean, default: false },
  razorpayKeyId: { type: String, default: '' },
  razorpayKeySecret: { type: String, default: '' },
  razorpayWebhookSecret: { type: String, default: '' },
  geminiApiKey: { type: String, default: '' },
  manufacturingLicenseNo: { type: String, default: '', trim: true },
  gmpCertificateNo: { type: String, default: '', trim: true },
  licenseValidTill: { type: Date, default: null },
  gmpValidTill: { type: Date, default: null },
  licenceValidityType: { type: String, enum: ['perpetual', 'time_bound', 'unknown'], default: 'unknown' },
  stateUtCode: { type: String, default: 'UP', trim: true },
  licenceSerial: { type: String, default: '1234', trim: true },
  spcReissueDeadline: { type: Date, default: new Date('2028-07-24') },
  qrImageBase64: { type: String, default: '' },
  qrImageUrl: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);