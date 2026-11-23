const express = require('express');
const mongoose = require('mongoose');
const VendorQualification = require('../../models/VendorQualification');
const Vendor = require('../../models/Vendor');
const RawMaterial = require('../../models/RawMaterial');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/vendor-qualifications — List supplier qualification audit records.
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { vendorId, status, rawMaterialId } = req.query;
    const filter = {};
    if (vendorId) filter.vendorId = vendorId;
    if (status) filter.qualificationStatus = status;
    if (rawMaterialId) filter.rawMaterialIds = rawMaterialId;
    const list = await VendorQualification.find(filter).sort({ auditDate: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor-qualifications — Record a supplier audit with explicit evidence.
router.post('/', authorize('manufacturing:qcApprove'), async (req, res) => {
  try {
    const {
      vendorId, qualificationStatus = 'conditional', auditDate, nextAuditDue,
      gmpComplianceScore, findings, rawMaterialIds
    } = req.body;

    if (!vendorId || !mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({ error: 'A valid vendorId is required' });
    }
    if (!['approved', 'conditional', 'disqualified'].includes(qualificationStatus)) {
      return res.status(400).json({ error: 'Invalid qualificationStatus' });
    }
    const auditorId = req.user?.id || req.user?._id;
    const auditorName = req.user?.name || req.user?.email;
    if (!auditorId || !auditorName) {
      return res.status(403).json({ error: 'Authenticated auditor identity is required' });
    }

    const auditAt = auditDate ? new Date(auditDate) : new Date();
    const nextDue = nextAuditDue ? new Date(nextAuditDue) : null;
    if (!Number.isFinite(auditAt.getTime())) {
      return res.status(400).json({ error: 'auditDate must be a valid date' });
    }
    if (!nextDue || !Number.isFinite(nextDue.getTime()) || nextDue <= auditAt) {
      return res.status(400).json({ error: 'A valid nextAuditDue after auditDate is required' });
    }

    if (!Array.isArray(rawMaterialIds) || rawMaterialIds.length === 0 ||
      rawMaterialIds.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ error: 'Select at least one valid raw material for this qualification' });
    }
    const uniqueMaterialIds = [...new Set(rawMaterialIds.map(String))];
    const [vendor, materials] = await Promise.all([
      Vendor.findById(vendorId).select('name company').lean(),
      RawMaterial.find({ _id: { $in: uniqueMaterialIds } }).select('_id').lean()
    ]);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (materials.length !== uniqueMaterialIds.length) {
      return res.status(400).json({ error: 'One or more selected raw materials do not exist' });
    }

    let score = null;
    if (gmpComplianceScore !== undefined && gmpComplianceScore !== null && gmpComplianceScore !== '') {
      score = Number(gmpComplianceScore);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        return res.status(400).json({ error: 'gmpComplianceScore must be a number from 0 to 100' });
      }
    }

    const record = await VendorQualification.create({
      vendorId,
      vendorName: vendor.company || vendor.name || 'Unnamed vendor',
      qualificationStatus,
      auditDate: auditAt,
      nextAuditDue: nextDue,
      auditorName,
      auditedByUserId: auditorId,
      gmpComplianceScore: score,
      findings: typeof findings === 'string' ? findings.trim() : '',
      rawMaterialIds: uniqueMaterialIds
    });

    req.io?.emit('vendor_qualification_updated', { type: 'created', id: record._id });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
