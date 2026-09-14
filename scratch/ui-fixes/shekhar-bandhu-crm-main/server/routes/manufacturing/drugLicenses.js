const express = require('express');
const DrugLicense = require('../../models/DrugLicense');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/drug-licenses — List all drug & manufacturing licenses
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const licenses = await DrugLicense.find({}).sort({ expiryDate: 1 }).lean();
    const now = new Date();
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const enriched = licenses.map(lic => {
      const exp = new Date(lic.expiryDate);
      let status = 'valid';
      if (exp <= now) status = 'expired';
      else if (exp <= d60) status = 'expiring_soon';

      return { ...lic, status };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drug-licenses — Register a drug license
router.post('/', authorize('manufacturing:create'), async (req, res) => {
  try {
    const { licenseNo, title, licenseType = 'Ayush_Form_25D', issuingAuthority, state, issuedDate, expiryDate, notes } = req.body;
    if (!licenseNo || !title || !issuingAuthority || !expiryDate) {
      return res.status(400).json({ error: 'licenseNo, title, issuingAuthority, and expiryDate are required' });
    }

    const exp = new Date(expiryDate);
    const now = new Date();
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    let status = 'valid';
    if (exp <= now) status = 'expired';
    else if (exp <= d60) status = 'expiring_soon';

    const lic = await DrugLicense.create({
      licenseNo: licenseNo.trim(),
      title: title.trim(),
      licenseType,
      issuingAuthority: issuingAuthority.trim(),
      state: state || 'Uttar Pradesh',
      issuedDate: issuedDate ? new Date(issuedDate) : new Date(),
      expiryDate: exp,
      status,
      notes: notes || ''
    });

    res.status(201).json(lic);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
