const express = require('express');
const PurchaseRequisition = require('../../models/PurchaseRequisition');
const SupplierQuotation = require('../../models/SupplierQuotation');
const Vendor = require('../../models/Vendor');
const { withTransaction } = require('../../utils/withTransaction');
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


router.get('/:id/quotations', authorize('vendor:view'), async (req, res) => {
  try {
    const requisition = await PurchaseRequisition.findById(req.params.id).lean();
    if (!requisition) return res.status(404).json({ error: 'Purchase requisition not found' });
    const quotations = await SupplierQuotation.find({ requisitionId: requisition._id }).sort({ totalAmount: 1, deliveryLeadTimeDays: 1, createdAt: 1 }).lean();
    const eligible = quotations.filter(q => ['pending_review', 'selected'].includes(q.status) && new Date(q.validUntil) > new Date());
    const lowest = eligible.reduce((best, q) => !best || Number(q.totalAmount || 0) < Number(best.totalAmount || 0) ? q : best, null);
    res.json({ requisitionId: requisition._id, requisitionNo: requisition.requisitionNo, selectedQuotationId: requisition.selectedQuotationId || null,
      quotations: quotations.map(q => ({ ...q, landedCost: Number(Number(q.totalAmount || 0).toFixed(2)), isLowestLandedCost: Boolean(lowest && String(q._id) === String(lowest._id)) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/quotations', authorize('vendor:create'), async (req, res) => {
  try {
    const user = actor(req);
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated quotation recorder identity is required' });
    const requisition = await PurchaseRequisition.findById(req.params.id);
    if (!requisition) return res.status(404).json({ error: 'Purchase requisition not found' });
    if (requisition.status !== 'approved' || requisition.purchaseOrderId) return res.status(409).json({ error: 'Supplier quotations can only be recorded against an approved, unconverted requisition' });
    const vendor = await Vendor.findById(req.body.vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const { items, vendorQuoteReference, evidenceRef } = req.body;
    if (!Array.isArray(items) || items.length !== requisition.items.length || !String(vendorQuoteReference || '').trim() || !String(evidenceRef || '').trim()) {
      return res.status(400).json({ error: 'A supplier quote reference, evidence reference and an exact match for every requisition line are required' });
    }
    const seen = new Set(); let subtotal = 0; let taxAmount = 0; const normalized = [];
    for (const item of items) {
      const key = item.rawMaterialId ? 'raw:' + String(item.rawMaterialId) : item.productId ? 'product:' + String(item.productId) : '';
      if (!key || seen.has(key)) return res.status(400).json({ error: 'Each quotation line must uniquely reference one requisition item' });
      seen.add(key);
      const requested = requisition.items.find(line =>
        item.rawMaterialId && line.rawMaterialId && String(line.rawMaterialId) === String(item.rawMaterialId) ||
        item.productId && line.productId && String(line.productId) === String(item.productId)
      );
      const qty = Number(item.qtyQuoted); const unitPrice = Number(item.unitPrice); const gstRate = Number(item.gstRate || 0);
      if (!requested || Math.abs(qty - Number(requested.qtyRequested)) > 0.0001 ||
          String(item.unit || '').trim().toLowerCase() !== String(requested.unit || '').trim().toLowerCase() ||
          !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
        return res.status(409).json({ error: 'Quotation quantities, units and item references must match the approved requisition; prices and GST must be valid', code: 'SUPPLIER_QUOTE_LINE_MISMATCH' });
      }
      const lineBase = Number((qty * unitPrice).toFixed(2)); const lineTax = Number((lineBase * gstRate / 100).toFixed(2));
      subtotal += lineBase; taxAmount += lineTax;
      normalized.push({ itemType: requested.itemType, rawMaterialId: requested.rawMaterialId || null, productId: requested.productId || null,
        name: requested.name, qtyQuoted: qty, unit: requested.unit, unitPrice, gstRate, lineBase, lineTax });
    }
    const quoteDate = req.body.quoteDate ? new Date(req.body.quoteDate) : new Date();
    const validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
    const freightAmount = Number(req.body.freightAmount || 0); const otherCharges = Number(req.body.otherCharges || 0);
    const deliveryLeadTimeDays = Number(req.body.deliveryLeadTimeDays);
    if (!Number.isFinite(quoteDate.getTime()) || !validUntil || !Number.isFinite(validUntil.getTime()) || validUntil <= new Date() ||
        !Number.isFinite(freightAmount) || freightAmount < 0 || !Number.isFinite(otherCharges) || otherCharges < 0 ||
        !Number.isInteger(deliveryLeadTimeDays) || deliveryLeadTimeDays < 0) {
      return res.status(400).json({ error: 'Quote dates, future validity, non-negative freight/charges and whole-number delivery lead time are required' });
    }
    const quotationNo = await generateAtomicDocumentNumber('supplierQuotationNo', 'SQ', 5);
    const [quotation] = await SupplierQuotation.create([{
      quotationNo, requisitionId: requisition._id, vendorId: vendor._id, vendorName: vendor.company || vendor.name || 'Vendor',
      vendorQuoteReference: String(vendorQuoteReference).trim().slice(0, 150), quoteDate, validUntil, items: normalized,
      subtotal: Number(subtotal.toFixed(2)), taxAmount: Number(taxAmount.toFixed(2)), freightAmount, otherCharges,
      totalAmount: Number((subtotal + taxAmount + freightAmount + otherCharges).toFixed(2)), deliveryLeadTimeDays,
      paymentTerms: String(req.body.paymentTerms || '').trim().slice(0, 500), evidenceRef: String(evidenceRef).trim().slice(0, 1000),
      notes: String(req.body.notes || '').trim().slice(0, 1000), submittedByUserId: user.id, submittedByName: user.name, status: 'pending_review'
    }]);
    req.io?.emit('supplier_quotation_updated', { type: 'submitted', id: quotation._id, requisitionId: requisition._id });
    res.status(201).json(quotation);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/quotations/:quotationId/select', authorize('vendor:edit'), async (req, res) => {
  try {
    const user = actor(req);
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated quotation reviewer identity is required' });
    const result = await withTransaction(async session => {
      const requisition = await PurchaseRequisition.findById(req.params.id).session(session);
      if (!requisition) throw Object.assign(new Error('Purchase requisition not found'), { statusCode: 404 });
      if (requisition.status !== 'approved' || requisition.purchaseOrderId) throw Object.assign(new Error('Only approved, unconverted requisitions can have a supplier quotation selected'), { statusCode: 409 });
      if (requisition.selectedQuotationId) throw Object.assign(new Error('A supplier quotation has already been selected for this requisition'), { statusCode: 409 });
      const quotation = await SupplierQuotation.findById(req.params.quotationId).session(session);
      if (!quotation || String(quotation.requisitionId) !== String(requisition._id)) throw Object.assign(new Error('Supplier quotation not found for this requisition'), { statusCode: 404 });
      if (quotation.status !== 'pending_review') throw Object.assign(new Error('Only pending supplier quotations can be selected'), { statusCode: 409 });
      if (String(quotation.submittedByUserId) === String(user.id)) throw Object.assign(new Error('Quotation recorder cannot independently select their own quotation'), { statusCode: 403, code: 'SUPPLIER_QUOTE_MAKER_CHECKER_REQUIRED' });
      if (new Date(quotation.validUntil) <= new Date()) throw Object.assign(new Error('Expired supplier quotations cannot be selected'), { statusCode: 409 });
      quotation.status = 'selected'; quotation.reviewedByUserId = user.id; quotation.reviewedByName = user.name;
      quotation.reviewedAt = new Date(); quotation.reviewNotes = String(req.body.reviewNotes || '').trim().slice(0, 1000);
      requisition.selectedQuotationId = quotation._id;
      await quotation.save({ session }); await requisition.save({ session });
      return { quotation, requisition };
    });
    req.io?.emit('supplier_quotation_updated', { type: 'selected', id: result.quotation._id, requisitionId: result.requisition._id });
    res.json(result);
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message, ...(err.code ? { code: err.code } : {}) }); }
});

router.patch('/:id/quotations/:quotationId/reject', authorize('vendor:edit'), async (req, res) => {
  try {
    const user = actor(req); const reason = String(req.body.reason || '').trim();
    if (!user.id || !user.name) return res.status(401).json({ error: 'Authenticated quotation reviewer identity is required' });
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
    const quotation = await SupplierQuotation.findById(req.params.quotationId);
    if (!quotation || String(quotation.requisitionId) !== String(req.params.id)) return res.status(404).json({ error: 'Supplier quotation not found for this requisition' });
    if (quotation.status !== 'pending_review') return res.status(409).json({ error: 'Only pending supplier quotations can be rejected' });
    if (String(quotation.submittedByUserId) === String(user.id)) return res.status(403).json({ error: 'Quotation recorder cannot reject their own quotation', code: 'SUPPLIER_QUOTE_MAKER_CHECKER_REQUIRED' });
    quotation.status = 'rejected'; quotation.reviewedByUserId = user.id; quotation.reviewedByName = user.name;
    quotation.reviewedAt = new Date(); quotation.rejectionReason = reason.slice(0, 1000);
    await quotation.save();
    req.io?.emit('supplier_quotation_updated', { type: 'rejected', id: quotation._id, requisitionId: req.params.id });
    res.json(quotation);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
