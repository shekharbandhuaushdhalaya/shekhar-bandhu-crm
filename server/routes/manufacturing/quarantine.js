const express = require('express');
const router = express.Router();
const RawMaterialQuarantine = require('../../models/RawMaterialQuarantine');
const RawMaterialQualitySpecification = require('../../models/RawMaterialQualitySpecification');
const GoodsReceivedNote = require('../../models/GoodsReceivedNote');
const { authorize } = require('../../middleware/authorize');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { logAction } = require('../../utils/auditLogger');

// GET /api/manufacturing/quarantine — List raw material quarantine lots
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { status, herbName, search } = req.query;
    const filter = {};
    if (status) filter.quarantineStatus = status;
    if (herbName) filter.herbName = { $regex: herbName.trim(), $options: 'i' };
    if (search) filter.$or = [
      { herbName: { $regex: search.trim(), $options: 'i' } },
      { batchNo: { $regex: search.trim(), $options: 'i' } },
      { botanicalName: { $regex: search.trim(), $options: 'i' } },
    ];

    const list = await RawMaterialQuarantine.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manufacturing/quarantine/near-expiry — Get raw materials nearing expiration date (within <= 60 days)
router.get('/near-expiry', authorize('inventory:view'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 60;
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const items = await RawMaterialQuarantine.find({
      quarantineStatus: 'released',
      expiryDate: { $gte: now, $lte: cutoff }
    }).sort({ expiryDate: 1 }).lean();

    const result = items.map(item => {
      const msLeft = new Date(item.expiryDate).getTime() - now.getTime();
      const daysToExpiry = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      return {
        ...item,
        daysToExpiry,
        isNearExpiry: daysToExpiry <= 60,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manufacturing/quarantine — register a specific received stock lot for QC.
router.post('/', authorize('inventory:create'), async (req, res) => {
  try {
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const { herbName, botanicalName, batchNo, supplierName, qty, unit, expiryDate, rawMaterialId, rawMaterialEntryId } = req.body;
    const quantity = Number(qty);
    const expiry = new Date(expiryDate);
    if (!herbName?.trim() || !batchNo?.trim() || !supplierName?.trim() || !rawMaterialEntryId || !Number.isFinite(quantity) || quantity <= 0 || !expiryDate || Number.isNaN(expiry.getTime())) {
      return res.status(400).json({ error: 'herbName, batchNo, supplierName, positive qty, expiryDate, and rawMaterialEntryId are required' });
    }

    // Never associate a quarantine record with a guessed batch or a different material.
    const entry = await RawMaterialEntry.findById(rawMaterialEntryId);
    if (!entry) return res.status(404).json({ error: 'Linked raw-material stock entry not found' });
    if (String(entry.batchNo).trim().toUpperCase() !== batchNo.trim().toUpperCase()) {
      return res.status(400).json({ error: 'Batch number does not match the linked stock entry' });
    }
    if (rawMaterialId && String(entry.rawMaterialId) !== String(rawMaterialId)) {
      return res.status(400).json({ error: 'Raw material does not match the linked stock entry' });
    }
    if (entry.qcStatus !== 'under_test') {
      return res.status(409).json({ error: 'Only stock entries under test can be registered in quarantine' });
    }
    const availableQty = Number(entry.qty || 0) - Number(entry.reservedQty || 0);
    if (Number(entry.reservedQty || 0) > 0) return res.status(409).json({ error: 'Stock with active production reservations cannot be quarantined' });
    if (Math.abs(availableQty - quantity) > 1e-9) return res.status(400).json({ error: 'Quarantine quantity must equal the complete unreserved stock-entry quantity; partial-lot disposition is not supported' });
    const existingLot = await RawMaterialQuarantine.findOne({ rawMaterialEntryId: entry._id });
    if (existingLot) return res.status(409).json({ error: 'A quarantine record already exists for this stock entry' });
    if (entry.expiryDate && new Date(entry.expiryDate).getTime() !== expiry.getTime()) {
      return res.status(400).json({ error: 'Expiry date does not match the linked stock entry' });
    }
    if (entry.vendorName && entry.vendorName.trim().toLowerCase() !== supplierName.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Supplier does not match the linked stock entry' });
    }

    const approvedSpecification = await RawMaterialQualitySpecification.findOne({ rawMaterialId: entry.rawMaterialId, status: 'approved', effectiveDate: { $lte: new Date() } }).sort({ effectiveDate: -1, approvedAt: -1 }).lean();
    if (!approvedSpecification || !approvedSpecification.approvedByUserId || !approvedSpecification.approvedAt) {
      return res.status(409).json({ error: 'An independently approved, effective incoming QC specification is required before quarantine registration' });
    }
    const quarantineLotNo = await generateAtomicDocumentNumber('quarantineLotNo_QRM', 'QRM-', 6);
    const [lot] = await RawMaterialQuarantine.create([{
      quarantineLotNo,
      herbName: herbName.trim(),
      botanicalName: botanicalName || '',
      batchNo: entry.batchNo,
      supplierName: supplierName.trim(),
      qty: quantity,
      unit: unit || 'kg',
      expiryDate: expiry,
      quarantineStatus: 'under_testing',
      receivedDate: new Date(),
      rawMaterialId: entry.rawMaterialId,
      rawMaterialEntryId: entry._id,
      qcSpecificationId: approvedSpecification._id,
      qcSpecificationVersion: approvedSpecification.specificationVersion,
      qcSpecificationTests: approvedSpecification.tests.map(test => ({ code: test.code, name: test.name, specification: test.specification, unit: test.unit || '', methodReference: test.methodReference, mandatory: test.mandatory !== false }))
    }]);
    res.status(201).json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/manufacturing/quarantine/:id/inspection — record actual incoming QC observations.
router.patch('/:id/inspection', authorize('quality:approve'), async (req, res) => {
  try {
    const { inspectionResults } = req.body;
    const actorId = req.user && (req.user.id || req.user._id);
    const actorName = req.user && (req.user.name || req.user.email);
    if (!actorId || !actorName) return res.status(403).json({ error: 'Authenticated QC analyst identity is required' });
    if (!Array.isArray(inspectionResults) || inspectionResults.length === 0) {
      return res.status(400).json({ error: 'At least one actual incoming inspection result is required' });
    }
    const seen = new Set();
    for (const result of inspectionResults) {
      if (!result || !String(result.testCode || '').trim() || !String(result.testName || '').trim() ||
          !String(result.methodReference || '').trim() || !String(result.specification || '').trim() ||
          !String(result.result || '').trim() || !['pass', 'fail'].includes(result.outcome) ||
          (result.evidenceRef !== undefined && String(result.evidenceRef).length > 500)) {
        return res.status(400).json({ error: 'Each inspection result requires test code, name, method, specification, actual result and pass/fail outcome' });
      }
      const code = String(result.testCode).trim().toUpperCase();
      if (seen.has(code)) return res.status(400).json({ error: 'Duplicate incoming inspection test code: ' + code });
      seen.add(code);
    }
    const lot = await RawMaterialQuarantine.findById(req.params.id);
    if (!lot) return res.status(404).json({ error: 'Quarantine lot not found' });
    if (lot.quarantineStatus !== 'under_testing') return res.status(409).json({ error: 'Inspection results can only be recorded while the lot is under testing' });
    const specificationTests = Array.isArray(lot.qcSpecificationTests) ? lot.qcSpecificationTests : [];
    if (!lot.qcSpecificationId || !lot.qcSpecificationVersion || !specificationTests.length) {
      return res.status(409).json({ error: 'Quarantine lot has no pinned approved incoming QC specification; re-register it against an approved specification' });
    }
    const specificationByCode = new Map(specificationTests.map(test => [String(test.code).trim().toUpperCase(), test]));
    for (const result of inspectionResults) {
      const code = String(result.testCode).trim().toUpperCase();
      const expected = specificationByCode.get(code);
      if (!expected || String(result.testName).trim() !== expected.name ||
          String(result.methodReference).trim() !== expected.methodReference ||
          String(result.specification).trim() !== expected.specification ||
          String(result.unit || '').trim() !== String(expected.unit || '').trim()) {
        return res.status(400).json({ error: 'Inspection test ' + code + ' does not match the lot\'s pinned approved specification' });
      }
    }
    const mandatoryCodes = specificationTests.filter(test => test.mandatory).map(test => String(test.code).trim().toUpperCase());
    const submittedCodes = new Set(inspectionResults.map(result => String(result.testCode).trim().toUpperCase()));
    const missingMandatory = mandatoryCodes.filter(code => !submittedCodes.has(code));
    if (missingMandatory.length) return res.status(400).json({ error: 'All mandatory specification tests must be recorded: ' + missingMandatory.join(', ') });
    lot.inspectionResults = inspectionResults.map(result => ({
      testCode: String(result.testCode).trim().toUpperCase(), testName: String(result.testName).trim(),
      methodReference: String(result.methodReference).trim(), specification: String(result.specification).trim(),
      result: String(result.result).trim(), unit: String(result.unit || '').trim(), outcome: result.outcome,
      evidenceRef: String(result.evidenceRef || '').trim()
    }));
    lot.inspectionRecordedByUserId = actorId;
    lot.inspectionRecordedByName = actorName;
    lot.inspectionRecordedAt = new Date();
    await lot.save();
    await logAction({ action: 'RAW_MATERIAL_INCOMING_INSPECTION_RECORDED', description: 'Recorded incoming inspection results for ' + lot.quarantineLotNo, details: { quarantineLotId: lot._id, rawMaterialEntryId: lot.rawMaterialEntryId, testCodes: [...seen] }, req });
    res.json(lot);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/manufacturing/quarantine/:id/release — evidence-backed QC disposition.
router.patch('/:id/release', authorize('quality:approve'), async (req, res) => {
  try {
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const { withTransaction } = require('../../utils/withTransaction');
    const { quarantineStatus, testReportNo, remarks } = req.body;
    if (!['released', 'rejected'].includes(quarantineStatus)) {
      return res.status(400).json({ error: 'quarantineStatus must be "released" or "rejected"' });
    }
    if (!testReportNo?.trim() || !remarks?.trim()) {
      return res.status(400).json({ error: 'A real testReportNo and QC remarks are required for disposition' });
    }
    const actor = req.user && (req.user.name || req.user.email);
    if (!actor) return res.status(403).json({ error: 'Authenticated QC tester identity is required' });

    const lot = await withTransaction(async session => {
      const currentLot = await RawMaterialQuarantine.findById(req.params.id).session(session);
      if (!currentLot) {
        const error = new Error('Quarantine lot not found');
        error.code = 'QUARANTINE_NOT_FOUND';
        throw error;
      }
      if (currentLot.quarantineStatus !== 'under_testing') {
        const error = new Error('Only a lot under testing can receive a QC disposition');
        error.code = 'QUARANTINE_ALREADY_DISPOSED';
        throw error;
      }
      if (!currentLot.rawMaterialEntryId || !currentLot.rawMaterialId) {
        const error = new Error('Quarantine lot has no verified stock-entry link');
        error.code = 'QUARANTINE_STOCK_LINK_REQUIRED';
        throw error;
      }
      const entry = await RawMaterialEntry.findById(currentLot.rawMaterialEntryId).session(session);
      if (!entry || String(entry.rawMaterialId) !== String(currentLot.rawMaterialId) ||
          String(entry.batchNo).trim().toUpperCase() !== String(currentLot.batchNo).trim().toUpperCase()) {
        const error = new Error('Linked stock entry does not match the quarantined material batch');
        error.code = 'QUARANTINE_STOCK_LINK_INVALID';
        throw error;
      }
      if (entry.qcStatus !== 'under_test') {
        const error = new Error('Linked stock entry is no longer under QC testing');
        error.code = 'QUARANTINE_STOCK_ALREADY_DISPOSED';
        throw error;
      }
      // Both release and rejection are controlled QC dispositions. Rejection needs
      // at least one recorded failure; release requires every recorded test to pass.
      const inspectionResults = Array.isArray(currentLot.inspectionResults) ? currentLot.inspectionResults : [];
      const specificationTests = Array.isArray(currentLot.qcSpecificationTests) ? currentLot.qcSpecificationTests : [];
      if (!currentLot.qcSpecificationId || !currentLot.qcSpecificationVersion || !specificationTests.length) {
        const error = new Error('Incoming QC disposition requires a pinned approved material specification');
        error.code = 'QUARANTINE_SPECIFICATION_REQUIRED';
        throw error;
      }
      const mandatoryCodes = specificationTests.filter(test => test.mandatory).map(test => String(test.code).trim().toUpperCase());
      const recordedCodes = new Set(inspectionResults.map(result => String(result.testCode).trim().toUpperCase()));
      if (mandatoryCodes.some(code => !recordedCodes.has(code))) {
        const error = new Error('Incoming QC disposition requires results for every mandatory test in the pinned specification');
        error.code = 'QUARANTINE_SPECIFICATION_TESTS_INCOMPLETE';
        throw error;
      }
      if (!inspectionResults.length ||
          (quarantineStatus === 'released' && inspectionResults.some(result => result.outcome !== 'pass')) ||
          (quarantineStatus === 'rejected' && !inspectionResults.some(result => result.outcome === 'fail'))) {
        const error = new Error(quarantineStatus === 'released'
          ? 'Incoming QC release requires recorded actual inspection results and every recorded test must pass'
          : 'Incoming QC rejection requires recorded actual inspection results with at least one failed test');
        error.code = 'QUARANTINE_INSPECTION_INCOMPLETE';
        throw error;
      }
      if (!currentLot.inspectionRecordedByUserId || String(currentLot.inspectionRecordedByUserId) === String(req.user?.id || req.user?._id)) {
        const error = new Error('Incoming QC analyst cannot independently approve their own inspection results or rejection');
        error.code = 'QUARANTINE_INSPECTION_MAKER_CHECKER_REQUIRED';
        throw error;
      }
      if (quarantineStatus === 'released') {
        const grnRefs = Array.isArray(entry.grnReferences) ? entry.grnReferences : [];
        const legacyGrnNo = !grnRefs.length && /^GRN-/i.test(String(entry.purchaseRef || '')) ? String(entry.purchaseRef) : '';
        const requiredGrnNos = grnRefs.map(ref => ref.grnNo).filter(Boolean);
        if (legacyGrnNo) requiredGrnNos.push(legacyGrnNo);
        for (const grnNo of [...new Set(requiredGrnNos)]) {
          const verifiedGrn = await GoodsReceivedNote.findOne({ grnNo, status: 'verified' }).session(session);
          if (!verifiedGrn) {
            const error = new Error('Incoming QC release is blocked until the linked GRN ' + grnNo + ' is independently verified');
            error.code = 'QUARANTINE_GRN_VERIFICATION_REQUIRED';
            throw error;
          }
        }
      }
      if (Number(entry.reservedQty || 0) > 0 || Math.abs(Number(entry.qty || 0) - Number(currentLot.qty || 0)) > 1e-9) {
        const error = new Error('Quarantined stock quantity changed or is reserved; QC disposition is blocked pending reconciliation');
        error.code = 'QUARANTINE_STOCK_QUANTITY_CONFLICT';
        throw error;
      }
      entry.qcStatus = quarantineStatus === 'released' ? 'approved' : 'rejected';
      await entry.save({ session });

      currentLot.quarantineStatus = quarantineStatus;
      currentLot.testReportNo = testReportNo.trim();
      currentLot.testingDate = new Date();
      currentLot.testedBy = actor;
      currentLot.releasedBy = actor;
      currentLot.remarks = remarks.trim();
      await currentLot.save({ session });
      return currentLot;
    });
    await logAction({
      action: 'RAW_MATERIAL_QUARANTINE_DISPOSITION',
      description: 'QC ' + quarantineStatus + ' quarantine lot ' + lot.quarantineLotNo,
      details: { quarantineLotId: lot._id, rawMaterialEntryId: lot.rawMaterialEntryId, batchNo: lot.batchNo, testReportNo: lot.testReportNo, remarks: lot.remarks },
      req
    });
    res.json(lot);
  } catch (err) {
    const status = err.code === 'QUARANTINE_NOT_FOUND' ? 404 :
      ['QUARANTINE_ALREADY_DISPOSED','QUARANTINE_STOCK_ALREADY_DISPOSED','QUARANTINE_STOCK_QUANTITY_CONFLICT'].includes(err.code) ? 409 :
      ['QUARANTINE_STOCK_LINK_REQUIRED','QUARANTINE_STOCK_LINK_INVALID'].includes(err.code) ? 422 :
      ['QUARANTINE_GRN_VERIFICATION_REQUIRED','QUARANTINE_INSPECTION_INCOMPLETE','QUARANTINE_INSPECTION_MAKER_CHECKER_REQUIRED','QUARANTINE_SPECIFICATION_REQUIRED','QUARANTINE_SPECIFICATION_TESTS_INCOMPLETE'].includes(err.code) ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
