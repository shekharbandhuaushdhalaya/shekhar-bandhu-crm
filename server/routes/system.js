const express = require('express');
const { authenticateToken } = require('./auth');
const SystemSettings = require('../models/SystemSettings');

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
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
