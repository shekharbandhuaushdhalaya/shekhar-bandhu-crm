const express = require('express');
const { authenticateToken } = require('./auth');
const SystemSettings = require('../models/SystemSettings');
const AuditLog = require('../models/AuditLog');

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

// PUT /api/system/settings (Admin-only)
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can modify company configurations.' });
    }

    let settings = await SystemSettings.findOne({ key: 'company_config' });
    if (!settings) {
      settings = new SystemSettings({ key: 'company_config' });
    }

    // Update fields
    const fields = [
      'firmName', 'firmAddress', 'firmEmail', 'firmPhone', 'firmGstin',
      'bankName', 'bankAccountNo', 'bankIfsc', 'bankBranch', 'bankUpi',
      'invoicePrefix', 'quotationPrefix', 'challanPrefix', 'dispatchPrefix',
      'defaultTerms', 'defaultGstRate'
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();
    res.json(settings);

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'UPDATE_SYSTEM_SETTINGS',
      description: `Updated global company settings: ${settings.firmName} (by ${req.user.name})`,
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/system/audit-logs (Admin-only)
router.get('/audit-logs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can view audit logs.' });
    }

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

module.exports = router;
