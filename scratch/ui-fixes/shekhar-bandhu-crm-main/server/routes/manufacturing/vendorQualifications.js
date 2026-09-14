const express = require('express');
const VendorQualification = require('../../models/VendorQualification');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/vendor-qualifications — List vendor qualification audit records
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { vendorId, status } = req.query;
    const filter = {};
    if (vendorId) filter.vendorId = vendorId;
    if (status) filter.qualificationStatus = status;

    const list = await VendorQualification.find(filter).sort({ auditDate: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor-qualifications — Record new vendor qualification audit
router.post('/', authorize('manufacturing:qcApprove'), async (req, res) => {
  try {
    const { vendorId, vendorName, qualificationStatus = 'approved', auditDate, nextAuditDue, auditorName, gmpComplianceScore, findings, rawMaterialIds } = req.body;

    if (!vendorId || !vendorName || !auditorName) {
      return res.status(400).json({ error: 'vendorId, vendorName, and auditorName are required' });
    }

    const nextDue = nextAuditDue ? new Date(nextAuditDue) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default

    const record = await VendorQualification.create({
      vendorId,
      vendorName,
      qualificationStatus,
      auditDate: auditDate ? new Date(auditDate) : new Date(),
      nextAuditDue: nextDue,
      auditorName,
      gmpComplianceScore: Number(gmpComplianceScore || 100),
      findings: findings || '',
      rawMaterialIds: rawMaterialIds || []
    });

    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
