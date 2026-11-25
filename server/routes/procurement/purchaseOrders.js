const express = require('express');
const PurchaseOrder = require('../../models/PurchaseOrder');
const PurchaseRequisition = require('../../models/PurchaseRequisition');
const SupplierQuotation = require('../../models/SupplierQuotation');
const GoodsReceivedNote = require('../../models/GoodsReceivedNote');
const SupplierReturn = require('../../models/SupplierReturn');
const Vendor = require('../../models/Vendor');
const VendorQualification = require('../../models/VendorQualification');
const Warehouse = require('../../models/Warehouse');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { withTransaction } = require('../../utils/withTransaction');
const idempotency = require('../../middleware/requiredIdempotency');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

router.get('/', authorize('vendor:view'), async (req, res) => {
  try {
    const { search, status, vendorId } = req.query;
    const filter = {};
    if (search) filter.$or = [{ poNo: { $regex: search, $options: 'i' } }, { vendorName: { $regex: search, $options: 'i' } }];
    if (status && status !== 'all') filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    res.json(await PurchaseOrder.find(filter).sort({ orderDate: -1, createdAt: -1 }).lean());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize('vendor:create'), validate(schemas.purchaseOrderSchema), async (req, res) => {
  try {
    const { vendorId, vendorName, items, notes, requisitionId } = req.body;
    if (requisitionId) {
      const po = await withTransaction(async session => {
        const requisition = await PurchaseRequisition.findById(requisitionId).session(session);
        if (!requisition) throw Object.assign(new Error('Purchase requisition not found'), { statusCode: 404 });
        if (requisition.status !== 'approved' || requisition.purchaseOrderId) {
          throw Object.assign(new Error('Only an approved, unconverted requisition can be converted to a purchase order'), { statusCode: 409, code: 'REQUISITION_NOT_CONVERTIBLE' });
        }
        if (!Array.isArray(requisition.items) || requisition.items.length !== items.length) {
          throw Object.assign(new Error('Purchase order must contain every approved requisition line exactly once'), { statusCode: 400 });
        }
        const seen = new Set();
        for (const item of items) {
          if ((!item.rawMaterialId && !item.productId) || (item.rawMaterialId && item.productId)) {
            throw Object.assign(new Error('Each PO line must reference exactly one raw material or finished product'), { statusCode: 400 });
          }
          const key = item.rawMaterialId ? 'raw:' + String(item.rawMaterialId) : 'product:' + String(item.productId);
          if (seen.has(key)) throw Object.assign(new Error('Duplicate purchase order line for the same requisition item'), { statusCode: 400 });
          seen.add(key);
          const requested = requisition.items.find(line =>
            item.rawMaterialId && line.rawMaterialId && String(line.rawMaterialId) === String(item.rawMaterialId) ||
            item.productId && line.productId && String(line.productId) === String(item.productId)
          );
          if (!requested || Math.abs(Number(item.qtyOrdered) - Number(requested.qtyRequested)) > 0.0001 ||
              String(item.unit || '').trim().toLowerCase() !== String(requested.unit || '').trim().toLowerCase()) {
            throw Object.assign(new Error('PO item quantity and unit must exactly match the approved requisition'), { statusCode: 409, code: 'REQUISITION_LINE_MISMATCH' });
          }
        }
        let selectedQuote = null;
        if (requisition.selectedQuotationId) {
          selectedQuote = await SupplierQuotation.findById(requisition.selectedQuotationId).session(session);
          if (!selectedQuote || selectedQuote.status !== 'selected' ||
              String(selectedQuote.requisitionId) !== String(requisition._id) ||
              String(selectedQuote.vendorId) !== String(vendorId) ||
              new Date(selectedQuote.validUntil) <= new Date()) {
            throw Object.assign(new Error('The selected supplier quotation is unavailable, expired or does not match the selected vendor'), { statusCode: 409, code: 'SELECTED_QUOTATION_INVALID' });
          }
          for (const item of items) {
            const quoteLine = selectedQuote.items.find(line =>
              item.rawMaterialId && line.rawMaterialId && String(line.rawMaterialId) === String(item.rawMaterialId) ||
              item.productId && line.productId && String(line.productId) === String(item.productId)
            );
            if (!quoteLine || Math.abs(Number(item.unitPrice) - Number(quoteLine.unitPrice)) > 0.0001 ||
                Math.abs(Number(item.gstRate || 0) - Number(quoteLine.gstRate || 0)) > 0.0001) {
              throw Object.assign(new Error('PO line pricing and GST must match the independently selected supplier quotation'), { statusCode: 409, code: 'SELECTED_QUOTATION_PRICE_MISMATCH' });
            }
          }
        } else if (String(req.body.procurementExceptionReason || '').trim().length < 20) {
          throw Object.assign(new Error('Select an independently reviewed supplier quotation or record a procurement exception of at least 20 characters'), { statusCode: 409, code: 'PROCUREMENT_QUOTATION_OR_EXCEPTION_REQUIRED' });
        }
        const vendor = await Vendor.findById(vendorId).session(session);
        if (!vendor) throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
        const resolvedVendorName = vendorName || vendor.company || vendor.name || 'Vendor';
        const poNo = await generateAtomicDocumentNumber('purchaseOrderNo', 'PO', 5, session);
        let subtotal = 0;
        let taxAmount = 0;
        const processedItems = items.map(item => {
          const lineBase = Number(item.qtyOrdered) * Number(item.unitPrice);
          const lineTax = lineBase * Number(item.gstRate || 0) / 100;
          subtotal += lineBase;
          taxAmount += lineTax;
          return { ...item, qtyReceived: 0 };
        });
        const [created] = await PurchaseOrder.create([{
          poNo, vendorId, vendorName: resolvedVendorName, sourceRequisitionId: requisition._id,
          sourceQuotationId: selectedQuote ? selectedQuote._id : null,
          procurementExceptionReason: String(req.body.procurementExceptionReason || '').trim(),
          orderDate: new Date(), items: processedItems,
          subtotal: Number(subtotal.toFixed(2)), taxAmount: Number(taxAmount.toFixed(2)),
          totalAmount: Number((subtotal + taxAmount).toFixed(2)), status: 'draft', notes,
          createdBy: req.user?.name || 'System', createdByUserId: req.user?.id || null
        }], { session });
        if (selectedQuote) {
          selectedQuote.status = 'converted';
          await selectedQuote.save({ session });
        }
        requisition.status = 'converted';
        requisition.purchaseOrderId = created._id;
        await requisition.save({ session });
        return created;
      });
      req.io?.emit('po_updated', { type: 'created', id: po._id });
      req.io?.emit('purchase_requisition_updated', { type: 'converted', id: req.body.requisitionId });
      return res.status(201).json(po);
    }
    const vend = await Vendor.findById(vendorId);
    if (!vend) return res.status(404).json({ error: 'Vendor not found' });
    const resolvedVendorName = vendorName || vend.company || vend.name || 'Vendor';
    const poNo = await generateAtomicDocumentNumber('purchaseOrderNo', 'PO', 5);

    let subtotal = 0;
    let taxAmount = 0;
    const processedItems = items.map(it => {
      if ((!it.rawMaterialId && !it.productId) || (it.rawMaterialId && it.productId)) {
        throw Object.assign(new Error(`PO item "${it.name}" must reference exactly one raw material or finished product`), { statusCode: 400 });
      }
      const lineBase = Number(it.qtyOrdered) * Number(it.unitPrice);
      const lineTax = (lineBase * Number(it.gstRate || 0)) / 100;
      subtotal += lineBase;
      taxAmount += lineTax;
      return { ...it, qtyReceived: 0 };
    });

    const po = await PurchaseOrder.create({
      poNo, vendorId, vendorName: resolvedVendorName, orderDate: new Date(), items: processedItems,
      subtotal: Number(subtotal.toFixed(2)), taxAmount: Number(taxAmount.toFixed(2)),
      totalAmount: Number((subtotal + taxAmount).toFixed(2)), status: 'draft', notes,
      createdBy: req.user?.name || 'System', createdByUserId: req.user?.id || null
    });
    req.io?.emit('po_updated', { type: 'created', id: po._id });
    res.status(201).json(po);
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message, ...(err.code ? { code: err.code } : {}) }); }
});


router.patch('/:id/approve', authorize('vendor:edit'), async (req, res) => {
  try {
    const approverId = req.user?.id || req.user?._id;
    if (!approverId) return res.status(403).json({ error: 'Authenticated approver identity is required' });
    const approverName = req.user?.name || req.user?.email || 'Approver';
    const approvedPo = await withTransaction(async session => {
      const po = await PurchaseOrder.findById(req.params.id).session(session);
      if (!po) throw Object.assign(new Error('Purchase Order not found'), { statusCode: 404 });
      if (po.status !== 'draft') throw Object.assign(new Error('Only draft purchase orders can be approved'), { statusCode: 409, code: 'PO_APPROVAL_CONFLICT' });
      if (po.createdByUserId && String(po.createdByUserId) === String(approverId)) {
        throw Object.assign(new Error('Purchase order creator cannot approve their own purchase order'), { statusCode: 403, code: 'PO_MAKER_CHECKER_REQUIRED' });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const item of (po.items || []).filter(line => line.rawMaterialId)) {
        const qualified = await VendorQualification.findOne({
          vendorId: po.vendorId, qualificationStatus: 'approved',
          verifiedByUserId: { $ne: null }, verifiedAt: { $ne: null },
          nextAuditDue: { $gte: today }, rawMaterialIds: item.rawMaterialId
        }).session(session).lean();
        if (!qualified) throw Object.assign(
          new Error('Vendor has no current approved qualification for raw material ' + item.name),
          { statusCode: 409, code: 'VENDOR_MATERIAL_NOT_QUALIFIED', rawMaterialId: item.rawMaterialId }
        );
      }
      const filter = { _id: po._id, status: 'draft' };
      if (po.updatedAt) filter.updatedAt = po.updatedAt;
      const updated = await PurchaseOrder.findOneAndUpdate(filter, {
        $set: { status: 'approved', approvedByUserId: approverId, approvedBy: approverName, approvedAt: new Date() }
      }, { new: true, runValidators: true, session });
      if (!updated) throw Object.assign(
        new Error('Purchase order changed while approval was being prepared; reload and review it again'),
        { statusCode: 409, code: 'PO_APPROVAL_CONFLICT' }
      );
      return updated;
    });
    req.io?.emit('po_updated', { type: 'approved', id: approvedPo._id });
    res.json(approvedPo);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
});

// Create a GRN and inward accepted goods atomically. Accepted receipts remain under_test
// until QC explicitly approves their InventoryEntry/RawMaterialEntry.
router.post('/:id/grn', idempotency, authorize('vendor:edit'), validate(schemas.grnSchema), async (req, res) => {
  try {
    if (!(req.user?.id || req.user?._id) || !(req.user?.name || req.user?.email)) {
      return res.status(403).json({ error: 'Authenticated goods-receiver identity is required to record a GRN' });
    }
    const result = await withTransaction(async session => {
      const po = await PurchaseOrder.findById(req.params.id).session(session);
      if (!po) throw Object.assign(new Error('Purchase Order not found'), { statusCode: 404 });
      if (!['approved', 'partially_received'].includes(po.status)) {
        throw Object.assign(new Error('Goods can only be received against an approved purchase order'), { statusCode: 409 });
      }

      const wh = await Warehouse.findById(req.body.warehouseId).session(session);
      if (!wh) throw Object.assign(new Error('Warehouse not found'), { statusCode: 404 });
      const grnNo = await generateAtomicDocumentNumber('goodsReceivedNoteNo', 'GRN', 5, session);
      const grnItems = [];

      for (let idx = 0; idx < req.body.items.length; idx += 1) {
        const item = req.body.items[idx];
        const received = Number(item.qtyReceived || 0);
        const accepted = Number(item.qtyAccepted || 0);
        const rejected = Number(item.qtyRejected || 0);
        if (accepted + rejected !== received) {
          throw Object.assign(new Error(`${item.name}: accepted + rejected quantity must equal received quantity`), { statusCode: 400 });
        }
        if ((!item.rawMaterialId && !item.productId) || (item.rawMaterialId && item.productId)) {
          throw Object.assign(new Error(`${item.name}: exactly one rawMaterialId or productId is required`), { statusCode: 400 });
        }

        const poItem = po.items.find(i =>
          (item.rawMaterialId && i.rawMaterialId && String(i.rawMaterialId) === String(item.rawMaterialId)) ||
          (item.productId && i.productId && String(i.productId) === String(item.productId))
        );
        if (!poItem) throw Object.assign(new Error(`${item.name}: item is not present on purchase order ${po.poNo}`), { statusCode: 400 });
        const outstanding = Math.max(0, Number(poItem.qtyOrdered || 0) - Number(poItem.qtyReceived || 0));
        if (accepted > outstanding) {
          throw Object.assign(new Error(`${item.name}: accepted quantity ${accepted} exceeds outstanding PO quantity ${outstanding}`), { statusCode: 409 });
        }

        const mfgDate = item.mfgDate ? new Date(item.mfgDate) : null;
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        grnItems.push({ ...item, batchNo: String(item.batchNo).trim(), supplierCoaRef: String(item.supplierCoaRef || '').trim(), supplierCoaNo: String(item.supplierCoaNo || '').trim(), supplierCoaDate: item.supplierCoaDate ? new Date(item.supplierCoaDate) : null, supplierCoaLabName: String(item.supplierCoaLabName || '').trim(), supplierCoaBatchNo: String(item.supplierCoaBatchNo || '').trim(), supplierCoaDocumentRef: String(item.supplierCoaDocumentRef || '').trim(), supplierCoaReviewStatus: 'not_reviewed', mfgDate, expiryDate });
        poItem.qtyReceived = Number(poItem.qtyReceived || 0) + accepted;

        if (accepted <= 0) continue;
        if (item.rawMaterialId) {
          const material = await RawMaterial.findById(item.rawMaterialId).session(session);
          if (!material) throw Object.assign(new Error(`${item.name}: raw material not found`), { statusCode: 404 });
          const existing = await RawMaterialEntry.findOne({
            rawMaterialId: item.rawMaterialId,
            warehouseId: wh._id,
            batchNo: item.batchNo
          }).session(session);
          if (existing && existing.qcStatus !== 'under_test') {
            throw Object.assign(new Error(`${item.name}: batch ${item.batchNo} already has QC status ${existing.qcStatus}; receive it under a distinct batch/lot before new QC`), { statusCode: 409 });
          }
          if (existing) {
            existing.initialQty = Number(existing.initialQty || 0) + accepted;
            existing.qty = Number(existing.qty || 0) + accepted;
            existing.purchaseRate = Number(poItem.unitPrice || 0);
            existing.vendorId = po.vendorId;
            existing.vendorName = po.vendorName;
            existing.purchaseRef = grnNo;
            if (existing.supplierCoaRef && item.supplierCoaRef && existing.supplierCoaRef !== String(item.supplierCoaRef).trim()) {
              throw Object.assign(new Error(item.name + ': supplier CoA reference differs from the existing supplier batch record'), { statusCode: 409, code: 'SUPPLIER_COA_BATCH_CONFLICT' });
            }
            existing.supplierCoaRef = String(item.supplierCoaRef || existing.supplierCoaRef || '').trim();
            existing.analyticalReportNo = existing.supplierCoaRef;
            existing.grnReferences = existing.grnReferences || [];
            const priorGrnRef = existing.grnReferences.find(ref => ref.grnNo === grnNo);
            if (priorGrnRef) priorGrnRef.receivedQty = Number(priorGrnRef.receivedQty || 0) + accepted;
            else existing.grnReferences.push({ grnNo, supplierCoaRef: String(item.supplierCoaRef || '').trim(), receivedQty: accepted });
            if (mfgDate) existing.mfgDate = mfgDate;
            if (expiryDate) existing.expiryDate = expiryDate;
            await existing.save({ session });
          } else {
            await RawMaterialEntry.create([{
              rawMaterialId: item.rawMaterialId, batchNo: item.batchNo,
              initialQty: accepted, qty: accepted, purchaseRate: Number(poItem.unitPrice || 0),
              vendorId: po.vendorId, vendorName: po.vendorName, purchaseRef: grnNo,
              supplierCoaRef: String(item.supplierCoaRef || '').trim(), analyticalReportNo: String(item.supplierCoaRef || '').trim(),
              grnReferences: [{ grnNo, supplierCoaRef: String(item.supplierCoaRef || '').trim(), receivedQty: accepted }],
              warehouseId: wh._id, warehouseName: wh.name, mfgDate, expiryDate,
              receivedDate: new Date(), qcStatus: 'under_test'
            }], { session });
          }
        } else {
          const product = await Product.findById(item.productId).session(session);
          if (!product) throw Object.assign(new Error(`${item.name}: product not found`), { statusCode: 404 });
          const vendorId = String(po.vendorId || '');
          const filter = {
            warehouseId: wh._id, productId: product._id, vendorId,
            packing: 0, batchNo: item.batchNo, qcStatus: 'under_test'
          };
          const entry = await InventoryEntry.findOneAndUpdate(filter, {
            $inc: { qtyBoxes: accepted },
            $set: {
              warehouseName: wh.name, productType: product.productType || '', size: product.size || '',
              colour: product.colour || '', shape: product.shape || '', weight: product.weight || '',
              hsnCode: product.hsnCode || '', vendorName: po.vendorName, purchaseRate: Number(poItem.unitPrice || 0),
              ...(mfgDate ? { mfgDate } : {}), ...(expiryDate ? { expiryDate } : {})
            },
            $setOnInsert: { packing: 0, batchNo: item.batchNo, qcStatus: 'under_test' }
          }, { new: true, upsert: true, session, setDefaultsOnInsert: true });
          await Product.updateOne({ _id: product._id }, { $inc: { stockLevel: accepted } }, { session });
          await StockLedger.create([{
            productId: product._id, warehouseId: wh._id, warehouseName: wh.name,
            type: 'IN', qtyBoxes: accepted, balanceBoxes: Number(entry.qtyBoxes || 0),
            reference: grnNo, note: `GRN receipt (QC under test) for ${po.poNo}`,
            createdBy: req.user?.name || 'System', packing: 0, vendorId, vendorName: po.vendorName,
            batchNo: item.batchNo, mfgDate, expiryDate, movementKey: `grn:${grnNo}:${idx}`
          }], { session });
        }
      }

      po.status = po.items.every(i => Number(i.qtyReceived || 0) >= Number(i.qtyOrdered || 0)) ? 'completed' : 'partially_received';
      await po.save({ session });
      const [grn] = await GoodsReceivedNote.create([{
        grnNo, poId: po._id, poNo: po.poNo, vendorId: po.vendorId, vendorName: po.vendorName,
        warehouseId: wh._id, receivedDate: new Date(), items: grnItems,
        gateEntryNo: String(req.body.gateEntryNo || '').trim(),
        vehicleNo: String(req.body.vehicleNo || '').trim(),
        driverName: String(req.body.driverName || '').trim(),
        transporterName: String(req.body.transporterName || '').trim(),
        eWayBillNo: String(req.body.eWayBillNo || '').trim(),
        gateInAt: req.body.gateInAt ? new Date(req.body.gateInAt) : new Date(),
        grossWeight: req.body.grossWeight ?? null,
        tareWeight: req.body.tareWeight ?? null,
        netWeight: req.body.netWeight ?? null,
        weightUnit: req.body.weightUnit || 'kg',
        weighmentSlipRef: String(req.body.weighmentSlipRef || '').trim(),
        status: 'pending_verification', notes: req.body.notes, receivedBy: req.user?.name || req.user?.email || 'System',
        receivedByName: req.user?.name || req.user?.email || 'System',
        receivedByUserId: req.user?.id || req.user?._id || null
      }], { session });
      return { grn, po };
    });
    await logAction({ action: 'GRN_GATE_ENTRY_RECORDED', description: 'Gate entry and weighment details recorded for ' + result.grn.grnNo, details: { grnId: result.grn._id, grnNo: result.grn.grnNo, gateEntryNo: result.grn.gateEntryNo, vehicleNo: result.grn.vehicleNo, grossWeight: result.grn.grossWeight, tareWeight: result.grn.tareWeight, netWeight: result.grn.netWeight, weightUnit: result.grn.weightUnit, weighmentSlipRef: result.grn.weighmentSlipRef }, req });
    req.io?.emit('grn_updated', { type: 'created', id: result.grn._id });
    res.status(201).json({ message: 'GRN receipt recorded; independent document verification and incoming QC are pending', ...result });
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message }); }
});

// PATCH /api/purchase-orders/grn/:id/verify — independent GRN document/receipt review.
router.get('/grn', authorize('vendor:view'), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.poId) filter.poId = req.query.poId;
    if (req.query.vendorId) filter.vendorId = req.query.vendorId;
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      const escapedSearch = Array.from(search).map(char => '.*+?^$()|[]{}\\'.includes(char) ? '\\' + char : char).join('');
      if (escapedSearch) filter.$or = [
        { grnNo: { $regex: escapedSearch, $options: 'i' } },
        { poNo: { $regex: escapedSearch, $options: 'i' } },
        { vendorName: { $regex: escapedSearch, $options: 'i' } }
      ];
    }
    const [items, total] = await Promise.all([
      GoodsReceivedNote.find(filter).sort({ receivedDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      GoodsReceivedNote.countDocuments(filter)
    ]);
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/grn/:id', authorize('vendor:view'), async (req, res) => {
  try {
    const record = await GoodsReceivedNote.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ error: 'Goods Received Note not found' });
    res.json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/grn/:id/verify', authorize('manufacturing:qcApprove'), async (req, res) => {
  try {
    const reviewerId = req.user?.id || req.user?._id;
    const reviewerName = req.user?.name || req.user?.email;
    const decision = req.body?.decision || 'verified';
    const verificationNotes = typeof req.body?.verificationNotes === 'string' ? req.body.verificationNotes.trim() : '';
    if (!reviewerId || !reviewerName) return res.status(403).json({ error: 'Authenticated independent reviewer identity is required' });
    if (!['verified', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be verified or rejected' });
    if (!verificationNotes) return res.status(400).json({ error: 'Verification notes are required' });
    if (decision === 'rejected' && !String(req.body.rejectionReason || '').trim()) return res.status(400).json({ error: 'A rejection reason is required' });
    const grn = await withTransaction(async session => {
      const record = await GoodsReceivedNote.findById(req.params.id).session(session);
      if (!record) throw Object.assign(new Error('Goods Received Note not found'), { statusCode: 404 });
      if (record.status !== 'pending_verification') throw Object.assign(new Error('Only pending GRNs can be independently verified'), { statusCode: 409 });
      if (record.receivedByUserId && String(record.receivedByUserId) === String(reviewerId)) throw Object.assign(new Error('The person recording receipt cannot verify the same GRN'), { statusCode: 403, code: 'GRN_MAKER_CHECKER_REQUIRED' });
      if (decision === 'verified') {
        const incompleteCoa = (record.items || []).filter(item => item.rawMaterialId && (!String(item.supplierCoaRef || '').trim() || !String(item.supplierCoaNo || '').trim() || !item.supplierCoaDate || !String(item.supplierCoaLabName || '').trim() || !String(item.supplierCoaBatchNo || '').trim() || !String(item.supplierCoaDocumentRef || '').trim() || String(item.supplierCoaBatchNo).trim().toUpperCase() !== String(item.batchNo).trim().toUpperCase()));
        if (incompleteCoa.length) throw Object.assign(new Error('Complete supplier CoA metadata, source-document reference and matching supplier batch are required for every raw-material line before GRN verification: ' + incompleteCoa.map(item => item.name).join(', ')), { statusCode: 409, code: 'GRN_SUPPLIER_COA_REQUIRED' });
        for (const item of record.items || []) {
          if (!item.rawMaterialId) continue;
          item.supplierCoaReviewStatus = 'reviewed';
          item.supplierCoaReviewedByUserId = reviewerId;
          item.supplierCoaReviewedByName = reviewerName;
          item.supplierCoaReviewedAt = new Date();
        }
      }
      record.status = decision;
      record.verifiedByUserId = reviewerId;
      record.verifiedByName = reviewerName;
      record.verifiedAt = new Date();
      record.verificationNotes = verificationNotes;
      record.rejectionReason = decision === 'rejected' ? String(req.body.rejectionReason).trim() : '';
      await record.save({ session });
      return record;
    });
    await logAction({ action: 'GRN_INDEPENDENT_VERIFICATION', description: 'GRN ' + grn.grnNo + ' ' + decision + ' by independent reviewer', details: { grnId: grn._id, grnNo: grn.grnNo, poId: grn.poId, decision, verificationNotes: grn.verificationNotes, rejectionReason: grn.rejectionReason }, req });
    req.io?.emit('grn_updated', { type: decision, id: grn._id });
    return res.json(grn);
  } catch (err) { return res.status(err.statusCode || 400).json({ error: err.message, code: err.code }); }
});

// Supplier returns track rejected quantities separately; rejected goods were never inwarded.
router.get('/grn/:id/supplier-returns', authorize('vendor:view'), async (req, res) => {
  try { const grn = await GoodsReceivedNote.findById(req.params.id).lean(); if (!grn) return res.status(404).json({ error: 'Goods Received Note not found' }); const rows = await SupplierReturn.find({ grnId: grn._id }).sort({ createdAt: -1 }).lean(); return res.json(rows); } catch (err) { return res.status(500).json({ error: err.message }); }
});
router.post('/grn/:id/supplier-returns', authorize('vendor:edit'), async (req, res) => {
  try {
    const makerId = req.user?.id || req.user?._id; const makerName = req.user?.name || req.user?.email;
    if (!makerId || !makerName) return res.status(403).json({ error: 'Authenticated return-request identity is required' });
    const b = req.body || {};
    if (!Number.isInteger(b.itemIndex) || !Number.isFinite(Number(b.qty)) || Number(b.qty) <= 0 || !String(b.reason || '').trim()) return res.status(400).json({ error: 'A valid item index, positive quantity and reason are required' });
    if (!['return_to_supplier','replacement_requested','debit_note_requested'].includes(b.resolutionType)) return res.status(400).json({ error: 'Invalid supplier return resolution type' });
    const record = await withTransaction(async session => {
      const grn = await GoodsReceivedNote.findById(req.params.id).session(session);
      if (!grn) throw Object.assign(new Error('Goods Received Note not found'), { statusCode: 404 });
      if (grn.status !== 'verified') throw Object.assign(new Error('Supplier returns require an independently verified GRN'), { statusCode: 409 });
      const item = (grn.items || [])[b.itemIndex]; if (!item) throw Object.assign(new Error('GRN item not found'), { statusCode: 404 });
      const prior = await SupplierReturn.find({ grnId: grn._id, itemIndex: b.itemIndex }).session(session);
      const outstanding = prior.filter(x => !['rejected','cancelled'].includes(x.status)).reduce((sum,x) => sum + Number(x.qty || 0), 0);
      if (outstanding + Number(b.qty) > Number(item.qtyRejected || 0)) throw Object.assign(new Error('Return quantity exceeds remaining rejected quantity'), { statusCode: 409, code: 'SUPPLIER_RETURN_QTY_EXCEEDED' });
      // Force all return reservations for this GRN to write the same document in the
      // transaction. Concurrent requests conflict/retry and re-read committed returns.
      const reservation = await GoodsReceivedNote.findOneAndUpdate(
        { _id: grn._id, status: 'verified' },
        { $inc: { returnReservationVersion: 1 } },
        { new: true, session }
      );
      if (!reservation) throw Object.assign(new Error('Verified GRN changed while reserving rejected quantity; reload and retry'), { statusCode: 409, code: 'SUPPLIER_RETURN_RESERVATION_CONFLICT' });
      const returnNo = await generateAtomicDocumentNumber('supplierReturnNo', 'SR', 6, session);
      const docs = await SupplierReturn.create([{ returnNo, grnId: grn._id, grnNo: grn.grnNo, poId: grn.poId, poNo: grn.poNo, vendorId: grn.vendorId, vendorName: grn.vendorName, itemIndex: b.itemIndex, rawMaterialId: item.rawMaterialId || null, productId: item.productId || null, itemName: item.name, batchNo: item.batchNo, qty: Number(b.qty), unit: item.unit || '', reason: String(b.reason).trim(), resolutionType: b.resolutionType, status: 'pending_approval', requestedByUserId: makerId, requestedByName: makerName }], { session });
      return docs[0];
    });
    await logAction({ action: 'SUPPLIER_RETURN_REQUESTED', description: 'Supplier return ' + record.returnNo + ' requested', details: { supplierReturnId: record._id, returnNo: record.returnNo, grnId: record.grnId, qty: record.qty, resolutionType: record.resolutionType }, req });
    req.io?.emit('supplier_return_updated', { type: 'created', id: record._id }); return res.status(201).json(record);
  } catch (err) { return res.status(err.statusCode || 400).json({ error: err.message, code: err.code }); }
});
router.patch('/supplier-returns/:id/approve', authorize('vendor:approve'), async (req, res) => {
  try {
    const reviewerId = req.user?.id || req.user?._id;
    const reviewerName = req.user?.name || req.user?.email;
    if (!reviewerId || !reviewerName) return res.status(403).json({ error: 'Authenticated independent reviewer identity is required' });
    const record = await SupplierReturn.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Supplier return not found' });
    if (record.status !== 'pending_approval') return res.status(409).json({ error: 'Only pending supplier returns can be reviewed' });
    if (String(record.requestedByUserId) === String(reviewerId)) return res.status(403).json({ error: 'Requester cannot approve own supplier return', code: 'SUPPLIER_RETURN_MAKER_CHECKER_REQUIRED' });
    const decision = req.body?.decision || 'approved';
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
    const reviewNotes = String(req.body?.reviewNotes || '').trim();
    const rejectionReason = String(req.body?.rejectionReason || '').trim();
    if (reviewNotes.length < 10 || (decision === 'rejected' && rejectionReason.length < 10)) {
      return res.status(400).json({ error: 'Substantive review notes and, when rejecting, a substantive rejection reason are required' });
    }
    const reviewed = await SupplierReturn.findOneAndUpdate(
      { _id: record._id, status: 'pending_approval', requestedByUserId: { $ne: reviewerId } },
      { $set: {
        status: decision, reviewedByUserId: reviewerId, reviewedByName: reviewerName,
        reviewedAt: new Date(), reviewNotes, rejectionReason: decision === 'rejected' ? rejectionReason : ''
      } },
      { new: true, runValidators: true }
    );
    if (!reviewed) return res.status(409).json({ error: 'Supplier return was changed by another reviewer', code: 'SUPPLIER_RETURN_REVIEW_CONFLICT' });
    await logAction({ action: 'SUPPLIER_RETURN_REVIEWED', description: 'Supplier return ' + reviewed.returnNo + ' ' + decision, details: { supplierReturnId: reviewed._id, decision }, req });
    return res.json(reviewed);
  } catch (err) { return res.status(400).json({ error: err.message, code: err.code }); }
});
router.patch('/supplier-returns/:id/dispatch', authorize('vendor:edit'), async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!actorId || !actorName) return res.status(403).json({ error: 'Authenticated dispatch identity is required' });
    const record = await SupplierReturn.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Supplier return not found' });
    if (record.status !== 'approved') return res.status(409).json({ error: 'Only approved returns can be dispatched' });
    const ref = String(req.body?.dispatchRef || '').trim();
    if (!ref) return res.status(400).json({ error: 'Dispatch/handover reference is required' });
    const filter = { _id: record._id, status: 'approved' };
    if (record.updatedAt) filter.updatedAt = record.updatedAt;
    const dispatched = await SupplierReturn.findOneAndUpdate(
      filter,
      { $set: { status: 'dispatched', dispatchRef: ref, dispatchedByUserId: actorId, dispatchedByName: actorName, dispatchedAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!dispatched) return res.status(409).json({ error: 'Supplier return changed before dispatch was recorded', code: 'SUPPLIER_RETURN_DISPATCH_CONFLICT' });
    await logAction({ action: 'SUPPLIER_RETURN_DISPATCHED', description: 'Supplier return ' + dispatched.returnNo + ' dispatched', details: { supplierReturnId: dispatched._id, dispatchRef: ref }, req });
    return res.json(dispatched);
  } catch (err) { return res.status(400).json({ error: err.message }); }
});
router.patch('/supplier-returns/:id/resolve', authorize('vendor:edit'), async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!actorId || !actorName) return res.status(403).json({ error: 'Authenticated resolution identity is required' });
    const record = await SupplierReturn.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Supplier return not found' });
    if (record.status !== 'dispatched') return res.status(409).json({ error: 'Only dispatched returns can be resolved' });
    const ref = String(req.body?.supplierReference || '').trim();
    if (!ref) return res.status(400).json({ error: 'Supplier replacement/debit-note reference is required' });
    const set = {
      status: 'closed', supplierReference: ref,
      resolvedByUserId: actorId, resolvedByName: actorName, resolvedAt: new Date()
    };
    if (record.resolutionType === 'replacement_requested') {
      const batch = String(req.body?.replacementBatchNo || '').trim();
      if (!batch) return res.status(400).json({ error: 'Replacement batch number is required' });
      const itemIdentity = record.rawMaterialId
        ? { rawMaterialId: record.rawMaterialId }
        : record.productId ? { productId: record.productId } : null;
      if (!itemIdentity) return res.status(409).json({ error: 'Supplier return has no linked material/product identity; replacement receipt cannot be verified', code: 'SUPPLIER_REPLACEMENT_ITEM_UNLINKED' });
      const replacementGrn = await GoodsReceivedNote.findOne({
        poId: record.poId,
        vendorId: record.vendorId,
        status: 'verified',
        items: { $elemMatch: {
          ...itemIdentity,
          batchNo: batch,
          qtyAccepted: { $gte: Number(record.qty || 0) }
        } }
      }).lean();
      if (!replacementGrn) return res.status(409).json({
        error: 'Replacement cannot be closed until a verified GRN records the same supplier, PO, material/product, batch and sufficient accepted quantity',
        code: 'SUPPLIER_REPLACEMENT_GRN_NOT_VERIFIED'
      });
      const replacementLine = (replacementGrn.items || []).find(line =>
        String(line.batchNo || '') === batch &&
        (record.rawMaterialId ? String(line.rawMaterialId || '') === String(record.rawMaterialId) : String(line.productId || '') === String(record.productId)) &&
        Number(line.qtyAccepted || 0) >= Number(record.qty || 0)
      );
      if (!replacementLine) return res.status(409).json({ error: 'Verified replacement GRN line did not reconcile to the supplier return', code: 'SUPPLIER_REPLACEMENT_GRN_LINE_MISMATCH' });
      set.replacementBatchNo = replacementLine.batchNo;
      set.replacementGrnId = replacementGrn._id;
      set.replacementGrnNo = replacementGrn.grnNo;
      set.replacementReceivedAt = replacementGrn.verifiedAt || replacementGrn.receivedDate || null;
    }
    if (record.resolutionType === 'debit_note_requested') {
      const noteDate = req.body?.supplierDebitNoteDate ? new Date(req.body.supplierDebitNoteDate) : null;
      if (req.body?.supplierDebitNoteDate && !Number.isFinite(noteDate.getTime())) return res.status(400).json({ error: 'Supplier debit-note date is invalid' });
      set.supplierDebitNoteRef = ref;
      set.supplierDebitNoteDate = noteDate;
    }
    const filter = { _id: record._id, status: 'dispatched' };
    if (record.updatedAt) filter.updatedAt = record.updatedAt;
    const resolved = await SupplierReturn.findOneAndUpdate(
      filter, { $set: set }, { new: true, runValidators: true }
    );
    if (!resolved) return res.status(409).json({ error: 'Supplier return changed before resolution was recorded', code: 'SUPPLIER_RETURN_RESOLUTION_CONFLICT' });
    await logAction({ action: 'SUPPLIER_RETURN_RESOLVED', description: 'Supplier return ' + resolved.returnNo + ' resolved', details: { supplierReturnId: resolved._id, supplierReference: ref, resolutionType: resolved.resolutionType }, req });
    return res.json(resolved);
  } catch (err) { return res.status(400).json({ error: err.message }); }
});
router.post('/3-way-match', authorize('vendor:view'), async (req, res) => {
  try {
    const { poId, purchaseInvoiceId } = req.body;
    if (!poId || !purchaseInvoiceId) return res.status(400).json({ error: 'poId and purchaseInvoiceId are required' });
    const [po, grns, invoice] = await Promise.all([
      PurchaseOrder.findById(poId).lean(),
      GoodsReceivedNote.find({ poId, status: 'verified' }).lean(),
      Invoice.findOne({ _id: purchaseInvoiceId, type: 'purchase' }).lean()
    ]);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    if (!invoice) return res.status(404).json({ error: 'Purchase Invoice not found' });

    const sameId = (a, b) => Boolean(a && b && String(a) === String(b));
    const itemKey = item => item.rawMaterialId ? 'raw:' + String(item.rawMaterialId)
      : item.productId ? 'product:' + String(item.productId) : null;
    const receivedByItem = new Map();
    for (const grn of grns) {
      for (const item of grn.items || []) {
        const key = itemKey(item);
        if (key) receivedByItem.set(key, (receivedByItem.get(key) || 0) + Number(item.qtyAccepted || 0));
      }
    }

    const invoiceByItem = new Map();
    const unlinkedInvoiceItems = [];
    for (const item of invoice.items || []) {
      const key = itemKey(item);
      if (!key) {
        unlinkedInvoiceItems.push(item.name || 'Unnamed invoice line');
        continue;
      }
      const qty = Number(item.qty || item.boxes || 0);
      const gross = qty * Number(item.rate || 0);
      const discount = Number(item.discountAmount || 0) || gross * Number(item.discountPercent || 0) / 100;
      const net = Math.max(0, gross - discount);
      const tax = net * Number(item.gstRate || 0) / 100;
      const prior = invoiceByItem.get(key) || { qty: 0, net: 0, tax: 0, items: [] };
      invoiceByItem.set(key, {
        qty: prior.qty + qty, net: prior.net + net, tax: prior.tax + tax,
        items: [...prior.items, item]
      });
    }

    const lineMatches = [];
    for (const poItem of po.items || []) {
      const key = itemKey(poItem);
      const received = key ? (receivedByItem.get(key) || 0) : 0;
      const invoiceLine = key ? (invoiceByItem.get(key) || { qty: 0, net: 0, tax: 0, items: [] }) : { qty: 0, net: 0, tax: 0, items: [] };
      const billed = invoiceLine.qty;
      const ordered = Number(poItem.qtyOrdered || 0);
      const unitCompatible = invoiceLine.items.every(item =>
        !item.unit || !poItem.unit || String(item.unit).trim().toLowerCase() === String(poItem.unit).trim().toLowerCase()
      );
      const receivedEnough = received >= ordered;
      const billedMatchesReceived = billed === received;
      const expectedNet = received * Number(poItem.unitPrice || 0);
      const expectedTax = expectedNet * Number(poItem.gstRate || 0) / 100;
      const priceMatch = Math.abs(invoiceLine.net - expectedNet) <= 0.01;
      const taxMatch = Math.abs(invoiceLine.tax - expectedTax) <= 0.01;
      lineMatches.push({
        item: poItem.name,
        rawMaterialId: poItem.rawMaterialId || null,
        productId: poItem.productId || null,
        unit: poItem.unit || '',
        ordered,
        accepted: received,
        billed,
        expectedNet: Number(expectedNet.toFixed(2)),
        invoicedNet: Number(invoiceLine.net.toFixed(2)),
        expectedTax: Number(expectedTax.toFixed(2)),
        invoicedTax: Number(invoiceLine.tax.toFixed(2)),
        receivedEnough,
        billedMatchesReceived,
        unitCompatible,
        priceMatch,
        taxMatch,
        matched: Boolean(key) && receivedEnough && billedMatchesReceived && unitCompatible && priceMatch && taxMatch
      });
    }

    const vendorMatches = invoice.vendorId
      ? sameId(invoice.vendorId, po.vendorId)
      : String(invoice.supplierName || '').trim().toLowerCase() === String(po.vendorName || '').trim().toLowerCase();
    const qtyMatch = lineMatches.length > 0 && lineMatches.every(line => line.receivedEnough && line.billedMatchesReceived) && unlinkedInvoiceItems.length === 0;
    const priceAndTaxMatch = lineMatches.length > 0 && lineMatches.every(line => line.priceMatch && line.taxMatch && line.unitCompatible);
    const invoiceAmountExcludingRoundOff = Number(invoice.amount || 0) - Number(invoice.roundOff || 0);
    const amountMatch = Math.abs(Number(po.totalAmount || 0) - invoiceAmountExcludingRoundOff) <= 0.01;
    const matchStatus = qtyMatch && priceAndTaxMatch && amountMatch && vendorMatches ? 'MATCHED' : 'DISCREPANCY_FOUND';
    const reasons = [];
    if (!vendorMatches) reasons.push('Supplier on invoice does not match the purchase order');
    if (!qtyMatch) reasons.push('One or more PO lines do not reconcile to accepted GRN and billed invoice quantities');
    if (!priceAndTaxMatch) reasons.push('One or more invoice line prices, GST rates or units differ from the purchase order');
    if (!amountMatch) reasons.push('Purchase invoice amount differs from the PO total after round-off by more than ₹0.01');
    if (unlinkedInvoiceItems.length) reasons.push('Invoice contains lines without a raw-material or product reference');

    res.json({
      matchStatus,
      poNo: po.poNo,
      invoiceNo: invoice.invoiceNo,
      poAmount: po.totalAmount,
      invoiceAmount: invoice.amount,
      vendorMatches,
      qtyMatch,
      amountMatch,
      lineMatches,
      unlinkedInvoiceItems,
      discrepancyReason: reasons.length ? reasons.join('; ') : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
