const express = require('express');
const { authenticateToken } = require('../auth/auth');
const SystemSettings = require('../../models/SystemSettings');
const AuditLog = require('../../models/AuditLog');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/system/settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({ key: 'company_config' });
    if (!settings) {
      // Create defaults if not present
      settings = await SystemSettings.create({ key: 'company_config' });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/system/settings
router.put('/settings', authenticateToken, authorize('settings:edit'), validate(schemas.systemSettingsSchema), async (req, res) => {
  try {

    let settings = await SystemSettings.findOne({ key: 'company_config' });
    if (!settings) {
      settings = new SystemSettings({ key: 'company_config' });
    }

    // Update fields
    const fields = [
      'firmName', 'firmAddress', 'firmEmail', 'firmPhone', 'firmGstin',
      'bankName', 'bankAccountNo', 'bankIfsc', 'bankBranch', 'bankUpi',
      'invoicePrefix', 'quotationPrefix', 'challanPrefix', 'dispatchPrefix',
      'defaultTerms', 'defaultGstRate',
      'signatureBase64', 'signatureUrl', 'dscSignatoryName', 'dscCertificateName',
      'paymentGatewayEnabled', 'razorpayKeyId', 'razorpayKeySecret', 'razorpayWebhookSecret',
      'geminiApiKey', 'manufacturingLicenseNo',
      'gmpCertificateNo', 'licenseValidTill', 'gmpValidTill',
      'qrImageBase64', 'qrImageUrl'
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();
    if (req.io) {
      req.io.emit('settings_updated', { type: 'updated' });
    }
    res.json(settings);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'UPDATE_SYSTEM_SETTINGS',
      description: `Updated global company settings: ${settings.firmName} (by ${req.user.name})`,
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/system/audit-logs
router.get('/audit-logs', authenticateToken, authorize('audit:view'), async (req, res) => {
  try {

    const { search, limit = 50, page = 1 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({
      logs,
      total,
      pages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// POST /api/system/reset-db — Reset entire database (keeps User collection untouched)
router.post('/reset-db', async (req, res) => {
  try {
    const models = [
      'Account', 'Activity', 'AuditLog', 'BankStatement', 'BatchProduction',
      'BillOfMaterials', 'Campaign', 'Challan', 'Complaint', 'Contact',
      'CreditNote', 'Customer', 'CustomerPricing', 'Dispatch', 'GstFiling',
      'Inventory', 'InventoryEntry', 'Invoice', 'LedgerEntry',
      'MedicalRepresentative', 'MrDailyLog', 'MrExpense', 'MrVisit',
      'Order', 'Otp', 'Payment', 'Product', 'ProductQuery', 'Quotation',
      'RawMaterial', 'RawMaterialEntry', 'RolePermission', 'SalesTarget',
      'Sample', 'StockLedger', 'StockMovement', 'SystemSettings',
      'Task', 'Vendor', 'Warehouse'
    ];

    for (const m of models) {
      const ModelClass = require(`../../models/${m}`);
      await ModelClass.deleteMany({});
    }

    if (req.io) {
      req.io.emit('settings_updated', { type: 'database_reset' });
    }
    res.json({ message: 'Database reset successfully. Only users are retained.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

function uploadFileToCloudinary(buffer, filename, folder = 'shekhar-bandhu/supporting-docs') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', public_id: path.parse(filename).name + '-' + Date.now() },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

// POST /api/system/upload — Upload a supporting document/image/pdf to Cloudinary
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const secureUrl = await uploadFileToCloudinary(req.file.buffer, req.file.originalname);
    res.json({
      name: req.file.originalname,
      url: secureUrl
    });
  } catch (err) {
    console.error('File Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;