const express = require('express');
const router = express.Router();
const RawMaterialQuarantine = require('../../models/RawMaterialQuarantine');
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
      rawMaterialEntryId: entry._id
    }]);
    res.status(201).json(lot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      ['QUARANTINE_STOCK_LINK_REQUIRED','QUARANTINE_STOCK_LINK_INVALID'].includes(err.code) ? 422 : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
