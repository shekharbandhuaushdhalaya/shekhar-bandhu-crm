const express = require('express');
const PurchaseRequisition = require('../../models/PurchaseRequisition');
const { authorize } = require('../../middleware/authorize');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

const router = express.Router();
const actor = req => ({
  id: req.user && (req.user.id || req.user._id),
  name: req.user && (req.user.name || req.user.email)
});

router.get('/', authorize('vendor:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.department) filter.department = String(req.query.department).slice(0, 100);
    if (req.query.mine === 'true') filter.requestedByUserId = actor(req).id;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const [items, total] = await Promise.all([
      PurchaseRequisition.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PurchaseRequisition.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('vendor:create'), async (req, res) => {
  try {
    const user = actor(req);
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated requester identity is required' });
    const { department, justification, items, requiredByDate } = req.body;
    if (!String(department || '').trim() || !String(justification || '').trim() ||
        !Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ error: 'Department, justification and 1 to 100 requisition items are required' });
    }
    const normalized = [];
    for (const item of items) {
      const raw = Boolean(item.rawMaterialId);
      const product = Boolean(item.productId);
      const qty = Number(item.qtyRequested);
      if (raw === product || (item.itemType !== 'raw_material' && item.itemType !== 'finished_product') ||
          (raw && item.itemType !== 'raw_material') || (product && item.itemType !== 'finished_product') ||
          !String(item.name || '').trim() || !String(item.unit || '').trim() ||
          !Number.isFinite(qty) || qty <= 0 ||
          (item.estimatedUnitPrice !== undefined && item.estimatedUnitPrice !== null &&
            (!Number.isFinite(Number(item.estimatedUnitPrice)) || Number(item.estimatedUnitPrice) < 0))) {
        return res.status(400).json({ error: 'Each item must identify exactly one matching raw material or finished product and include a positive quantity and unit' });
      }
      normalized.push({
        itemType: item.itemType, rawMaterialId: raw ? item.rawMaterialId : null,
        productId: product ? item.productId : null, name: String(item.name).trim().slice(0, 200),
        qtyRequested: qty, unit: String(item.unit).trim().slice(0, 30),
        estimatedUnitPrice: item.estimatedUnitPrice == null ? null : Number(item.estimatedUnitPrice),
        notes: String(item.notes || '').trim().slice(0, 500)
      });
    }
    const date = requiredByDate ? new Date(requiredByDate) : null;
    if (date && !Number.isFinite(date.getTime())) return res.status(400).json({ error: 'requiredByDate must be a valid date' });
    const requisitionNo = await generateAtomicDocumentNumber('purchaseRequisitionNo', 'PR', 5);
    const [record] = await PurchaseRequisition.create([{
      requisitionNo, requestedByUserId: user.id, requestedByName: user.name,
      createdByUserId: user.id, department: String(department).trim().slice(0, 100),
      justification: String(justification).trim().slice(0, 2000), requiredByDate: date,
      items: normalized, status: 'draft'
    }]);
    req.io?.emit('purchase_requisition_updated', { type: 'created', id: record._id });
    res.status(201).json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/submit', authorize('vendor:edit'), async (req, res) => {
  try {
    const user = actor(req);
    const record = await PurchaseRequisition.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Purchase requisition not found' });
    if (record.status !== 'draft') return res.status(409).json({ error: 'Only draft requisitions can be submitted' });
    if (!user.id || String(record.requestedByUserId) !== String(user.id)) {
      return res.status(403).json({ error: 'Only the requester may submit this requisition' });
    }
    record.status = 'pending_approval';
    record.submittedAt = new Date();
    await record.save();
    req.io?.emit('purchase_requisition_updated', { type: 'submitted', id: record._id });
    res.json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/approve', authorize('vendor:edit'), async (req, res) => {
  try {
    const user = actor(req);
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated approver identity is required' });
    const record = await PurchaseRequisition.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Purchase requisition not found' });
    if (record.status !== 'pending_approval') return res.status(409).json({ error: 'Only submitted requisitions can be approved' });
    if (String(record.requestedByUserId) === String(user.id)) {
      return res.status(403).json({ error: 'Requester cannot approve their own requisition', code: 'REQUISITION_MAKER_CHECKER_REQUIRED' });
    }
    record.status = 'approved';
    record.approvedByUserId = user.id;
    record.approvedByName = user.name;
    record.approvedAt = new Date();
    await record.save();
    req.io?.emit('purchase_requisition_updated', { type: 'approved', id: record._id });
    res.json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/reject', authorize('vendor:edit'), async (req, res) => {
  try {
    const user = actor(req);
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated reviewer identity is required' });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
    const record = await PurchaseRequisition.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Purchase requisition not found' });
    if (record.status !== 'pending_approval') return res.status(409).json({ error: 'Only submitted requisitions can be rejected' });
    if (String(record.requestedByUserId) === String(user.id)) {
      return res.status(403).json({ error: 'Requester cannot reject their own requisition', code: 'REQUISITION_MAKER_CHECKER_REQUIRED' });
    }
    record.status = 'rejected';
    record.rejectedByUserId = user.id;
    record.rejectedByName = user.name;
    record.rejectedAt = new Date();
    record.rejectionReason = reason.slice(0, 1000);
    await record.save();
    req.io?.emit('purchase_requisition_updated', { type: 'rejected', id: record._id });
    res.json(record);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
