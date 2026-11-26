const express = require('express');
const mongoose = require('mongoose');
const VendorQualification = require('../../models/VendorQualification');
const Vendor = require('../../models/Vendor');
const RawMaterial = require('../../models/RawMaterial');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/idempotency');

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
router.post('/', authorize('manufacturing:qcApprove'), idempotency, async (req, res) => {
  try {
    const {
      vendorId, qualificationStatus = 'conditional', auditDate, nextAuditDue,
      gmpComplianceScore, findings, rawMaterialIds, documents
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
    if (!Array.isArray(documents) || documents.length === 0 || documents.some(doc => !doc || typeof doc.name !== 'string' || !doc.name.trim() || typeof doc.url !== 'string' || !doc.url.trim())) {
      return res.status(400).json({ error: 'At least one named supplier qualification evidence reference is required' });
    }
    const normalizedDocuments = documents.map(doc => ({ name: doc.name.trim().slice(0, 200), url: doc.url.trim().slice(0, 1000) }));
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
      qualificationStatus: 'pending_verification',
      proposedQualificationStatus: qualificationStatus,
      auditDate: auditAt,
      nextAuditDue: nextDue,
      auditorName,
      auditedByUserId: auditorId,
      gmpComplianceScore: score,
      findings: typeof findings === 'string' ? findings.trim() : '',
      documents: normalizedDocuments,
      rawMaterialIds: uniqueMaterialIds
    });

    req.io?.emit('vendor_qualification_updated', { type: 'created', id: record._id });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// PATCH /api/vendor-qualifications/:id/verify — independent review of a supplier audit.
router.patch('/:id/verify', authorize('manufacturing:qcApprove'), idempotency, async (req, res) => {
  try {
    const record = await VendorQualification.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Vendor qualification record not found' });
    if (record.qualificationStatus !== 'pending_verification') {
      return res.status(409).json({ error: 'Only pending supplier qualification records can be verified' });
    }
    const reviewerId = req.user?.id || req.user?._id;
    const reviewerName = req.user?.name || req.user?.email;
    if (!reviewerId || !reviewerName) {
      return res.status(403).json({ error: 'Authenticated independent reviewer identity is required' });
    }
    if (!Array.isArray(record.documents) || record.documents.length === 0 || record.documents.some(doc => !doc?.name?.trim() || !doc?.url?.trim())) {
      return res.status(409).json({ error: 'Supplier qualification cannot be approved without named supporting evidence references', code: 'SUPPLIER_QUALIFICATION_EVIDENCE_REQUIRED' });
    }
    if (String(record.auditedByUserId || '') === String(reviewerId)) {
      return res.status(403).json({ error: 'The supplier auditor cannot verify their own qualification decision', code: 'SUPPLIER_QUALIFICATION_MAKER_CHECKER_REQUIRED' });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (record.nextAuditDue && new Date(record.nextAuditDue) < today && record.proposedQualificationStatus === 'approved') {
      return res.status(409).json({ error: 'An expired supplier audit cannot be approved', code: 'SUPPLIER_AUDIT_EXPIRED' });
    }
    const verificationNotes = typeof req.body?.verificationNotes === 'string' ? req.body.verificationNotes.trim() : '';
    if (!verificationNotes) return res.status(400).json({ error: 'Independent verification notes are required' });

    // Conditional pending-state update ensures that concurrent reviewers have one winner.
    const verified = await VendorQualification.findOneAndUpdate(
      { _id: record._id, qualificationStatus: 'pending_verification', auditedByUserId: { $ne: reviewerId } },
      { $set: {
        qualificationStatus: record.proposedQualificationStatus,
        verifiedByUserId: reviewerId,
        verifiedByName: reviewerName,
        verifiedAt: new Date(),
        verificationNotes
      } },
      { new: true, runValidators: true }
    );
    if (!verified) {
      return res.status(409).json({ error: 'Supplier qualification was already verified or changed by another reviewer', code: 'SUPPLIER_QUALIFICATION_CONCURRENT_REVIEW' });
    }
    req.io?.emit('vendor_qualification_updated', { type: 'verified', id: verified._id });
    return res.json(verified);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
