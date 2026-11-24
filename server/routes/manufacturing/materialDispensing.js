const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const RawMaterialLedger = require('../../models/RawMaterialLedger');
const MaterialDispensing = require('../../models/MaterialDispensing');
const { authorize } = require('../../middleware/authorize');
const { withTransaction } = require('../../utils/withTransaction');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const router = express.Router();

router.post('/:id/dispensings', authorize('manufacturing:edit'), async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated dispensing operator identity is required' });
    const { stageIndex, items } = req.body;
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'A valid stage index and at least one weighed material lot are required' });
    const result = await withTransaction(async session => {
      const batch = await BatchProduction.findById(req.params.id).session(session);
      if (!batch) throw Object.assign(new Error('Batch production run not found'), { statusCode: 404 });
      if (batch.status !== 'in_progress') throw Object.assign(new Error('Materials can only be dispensed to an in-progress batch'), { statusCode: 409 });
      if (stageIndex >= batch.stages.length) throw Object.assign(new Error('Invalid manufacturing stage index'), { statusCode: 400 });
      const stage = batch.stages[stageIndex];
      if (!stage || !['pending', 'in_progress'].includes(stage.status)) throw Object.assign(new Error('Material dispensing is only allowed before the stage is completed'), { statusCode: 409 });
      const pending = await MaterialDispensing.find({ batchId: batch._id, stageIndex, status: 'pending_verification' }).session(session).lean();
      const pendingByEntry = new Map();
      for (const record of pending) for (const line of record.items || []) {
        const key = String(line.rawMaterialEntryId);
        pendingByEntry.set(key, (pendingByEntry.get(key) || 0) + Number(line.qtyDispensed || 0));
      }
      const normalized = [], submittedEntryIds = new Set();
      for (const line of items) {
        const qty = Number(line.qtyDispensed), entryKey = String(line.rawMaterialEntryId || '');
        if (!line.rawMaterialId || !line.rawMaterialEntryId || !Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Each dispensing line needs a material, reserved stock lot and positive weighed quantity'), { statusCode: 400 });
        if (submittedEntryIds.has(entryKey)) throw Object.assign(new Error('Use one dispensing line per stock lot; combine duplicate lot quantities'), { statusCode: 400 });
        submittedEntryIds.add(entryKey);
        const reservation = (batch.ingredientsReserved || []).find(r => String(r.rawMaterialId) === String(line.rawMaterialId) && String(r.rawMaterialEntryId) === entryKey);
        if (!reservation || (reservation.stageName && reservation.stageName !== stage.name)) throw Object.assign(new Error('The selected stock lot is not reserved for this production batch and stage'), { statusCode: 409 });
        const alreadyPending = pendingByEntry.get(entryKey) || 0;
        if (alreadyPending + qty > Number(reservation.qtyReserved || 0) + 0.0001) throw Object.assign(new Error('Dispensing quantity exceeds the remaining batch reservation for this lot'), { statusCode: 409 });
        const entry = await RawMaterialEntry.findById(line.rawMaterialEntryId).session(session);
        if (!entry || String(entry.rawMaterialId) !== String(line.rawMaterialId) || entry.qcStatus !== 'approved' ||
            Number(entry.qty || 0) < alreadyPending + qty || Number(entry.reservedQty || 0) < alreadyPending + qty ||
            (entry.expiryDate && new Date(entry.expiryDate) <= new Date())) {
          throw Object.assign(new Error('Selected raw-material lot is missing, expired, not QC-approved, or has insufficient reserved balance'), { statusCode: 409 });
        }
        const material = await RawMaterial.findById(line.rawMaterialId).session(session);
        normalized.push({ rawMaterialId: line.rawMaterialId, rawMaterialEntryId: entry._id, materialName: material ? material.name : '', lotNo: entry.batchNo, qtyDispensed: Number(qty.toFixed(2)), unit: line.unit || (material && material.unit) || '' });
        pendingByEntry.set(entryKey, alreadyPending + qty);
      }
      const [record] = await MaterialDispensing.create([{
        dispensingNo: await generateAtomicDocumentNumber('dispensingNo', 'DSP-', 6),
        batchId: batch._id, batchNo: batch.batchNo, stageIndex, stageName: stage.name, items: normalized,
        status: 'pending_verification', dispensedBy: req.user.id, dispensedByName: req.user.name, dispensedAt: new Date()
      }], { session });
      return record;
    });
    res.status(201).json(result);
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message }); }
});

router.patch('/:id/dispensings/:dispensingId/verify', authorize('manufacturing:edit'), async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.name) return res.status(401).json({ error: 'Authenticated dispensing reviewer identity is required' });
    const result = await withTransaction(async session => {
      const batch = await BatchProduction.findById(req.params.id).session(session);
      if (!batch) throw Object.assign(new Error('Batch production run not found'), { statusCode: 404 });
      const record = await MaterialDispensing.findOne({ _id: req.params.dispensingId, batchId: batch._id }).session(session);
      if (!record) throw Object.assign(new Error('Material dispensing record not found'), { statusCode: 404 });
      if (record.status !== 'pending_verification') throw Object.assign(new Error('Only pending dispensing records can be verified'), { statusCode: 409 });
      if (String(record.dispensedBy) === String(req.user.id)) throw Object.assign(new Error('Independent dispensing verification is required'), { statusCode: 400 });
      const stage = batch.stages[record.stageIndex];
      if (!stage || stage.name !== record.stageName || stage.status === 'completed') throw Object.assign(new Error('The referenced manufacturing stage is no longer available for dispensing verification'), { statusCode: 409 });
      for (const line of record.items) {
        const reservation = (batch.ingredientsReserved || []).find(r => String(r.rawMaterialId) === String(line.rawMaterialId) && String(r.rawMaterialEntryId) === String(line.rawMaterialEntryId));
        if (!reservation || (reservation.stageName && reservation.stageName !== stage.name) || Number(reservation.qtyReserved || 0) + 0.0001 < line.qtyDispensed) throw Object.assign(new Error('Batch reservation changed; dispensing cannot be verified'), { statusCode: 409 });
        const entry = await RawMaterialEntry.findById(line.rawMaterialEntryId).session(session);
        if (!entry || entry.qcStatus !== 'approved' || !entry.warehouseId || Number(entry.qty || 0) < line.qtyDispensed ||
            Number(entry.reservedQty || 0) < line.qtyDispensed || (entry.expiryDate && new Date(entry.expiryDate) <= new Date())) {
          throw Object.assign(new Error('Stock lot eligibility, warehouse assignment or reserved balance changed; dispensing cannot be verified'), { statusCode: 409 });
        }
        entry.qty = Number((entry.qty - line.qtyDispensed).toFixed(2));
        entry.reservedQty = Number((entry.reservedQty - line.qtyDispensed).toFixed(2));
        entry.issuedQty = Number(((entry.issuedQty || 0) + line.qtyDispensed).toFixed(2));
        await entry.save({ session });
        reservation.qtyReserved = Number((reservation.qtyReserved - line.qtyDispensed).toFixed(2));
        const consumed = (batch.ingredientsConsumed || []).find(c => String(c.rawMaterialEntryId) === String(entry._id) && Number(c.stageIndex) === record.stageIndex);
        if (consumed) consumed.qtyConsumed = Number((consumed.qtyConsumed + line.qtyDispensed).toFixed(2));
        else batch.ingredientsConsumed.push({ rawMaterialId: entry.rawMaterialId, rawMaterialEntryId: entry._id, qtyConsumed: line.qtyDispensed, batchNo: entry.batchNo, stageIndex: record.stageIndex, dispensingNo: record.dispensingNo });
        batch.rawMaterialCost = Number(((batch.rawMaterialCost || 0) + line.qtyDispensed * (entry.purchaseRate || 0)).toFixed(2));
        await RawMaterialLedger.create([{
          rawMaterialId: entry.rawMaterialId, warehouseId: entry.warehouseId, warehouseName: entry.warehouseName || '',
          type: 'OUT', qty: line.qtyDispensed, balance: entry.qty, reference: record.dispensingNo,
          note: 'Verified production dispensing for batch ' + batch.batchNo, batchNo: entry.batchNo,
          movementKey: record.dispensingNo + ':' + String(entry._id), createdBy: req.user.name
        }], { session });
        stage.inputQty = Number(((stage.inputQty || 0) + line.qtyDispensed).toFixed(2));
      }
      batch.ingredientsReserved = (batch.ingredientsReserved || []).filter(r => Number(r.qtyReserved || 0) > 0.0001);
      record.status = 'verified';
      record.verifiedBy = req.user.id;
      record.verifiedByName = req.user.name;
      record.verifiedAt = new Date();
      record.verificationNotes = req.body.notes || '';
      await batch.save({ session });
      await record.save({ session });
      return record;
    });
    res.json(result);
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message }); }
});

module.exports = router;
