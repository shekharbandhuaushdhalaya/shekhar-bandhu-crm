const express = require('express');
const PurchaseOrder = require('../../models/PurchaseOrder');
const GoodsReceivedNote = require('../../models/GoodsReceivedNote');
const Vendor = require('../../models/Vendor');
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
    const { vendorId, vendorName, items, notes } = req.body;
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
      totalAmount: Number((subtotal + taxAmount).toFixed(2)), status: 'approved', notes,
      createdBy: req.user?.name || 'System'
    });
    req.io?.emit('po_updated', { type: 'created', id: po._id });
    res.status(201).json(po);
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message }); }
});

// Create a GRN and inward accepted goods atomically. Accepted receipts remain under_test
// until QC explicitly approves their InventoryEntry/RawMaterialEntry.
router.post('/:id/grn', authorize('vendor:edit'), validate(schemas.grnSchema), async (req, res) => {
  try {
    const result = await withTransaction(async session => {
      const po = await PurchaseOrder.findById(req.params.id).session(session);
      if (!po) throw Object.assign(new Error('Purchase Order not found'), { statusCode: 404 });
      if (['cancelled', 'completed'].includes(po.status)) {
        throw Object.assign(new Error(`Cannot receive goods against a ${po.status} purchase order`), { statusCode: 409 });
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
        grnItems.push({ ...item, mfgDate, expiryDate });
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
            if (mfgDate) existing.mfgDate = mfgDate;
            if (expiryDate) existing.expiryDate = expiryDate;
            await existing.save({ session });
          } else {
            await RawMaterialEntry.create([{
              rawMaterialId: item.rawMaterialId, batchNo: item.batchNo,
              initialQty: accepted, qty: accepted, purchaseRate: Number(poItem.unitPrice || 0),
              vendorId: po.vendorId, vendorName: po.vendorName, purchaseRef: grnNo,
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
        status: 'verified', notes: req.body.notes, receivedBy: req.user?.name || 'System'
      }], { session });
      return { grn, po };
    });
    req.io?.emit('grn_updated', { type: 'created', id: result.grn._id });
    res.status(201).json({ message: 'GRN processed; accepted stock is awaiting QC approval', ...result });
  } catch (err) { res.status(err.statusCode || 400).json({ error: err.message }); }
});

router.post('/3-way-match', authorize('vendor:view'), async (req, res) => {
  try {
    const { poId, purchaseInvoiceId } = req.body;
    if (!poId || !purchaseInvoiceId) return res.status(400).json({ error: 'poId and purchaseInvoiceId are required' });
    const [po, grns, invoice] = await Promise.all([
      PurchaseOrder.findById(poId).lean(), GoodsReceivedNote.find({ poId }).lean(),
      Invoice.findOne({ _id: purchaseInvoiceId, type: 'purchase' }).lean()
    ]);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    if (!invoice) return res.status(404).json({ error: 'Purchase Invoice not found' });
    const totalQtyOrdered = po.items.reduce((s, i) => s + Number(i.qtyOrdered || 0), 0);
    const totalQtyReceived = grns.reduce((s, g) => s + g.items.reduce((is, item) => is + Number(item.qtyAccepted || 0), 0), 0);
    const totalQtyBilled = invoice.items.reduce((s, i) => s + Number(i.qty || i.boxes || 0), 0);
    const qtyMatch = totalQtyReceived >= totalQtyOrdered && totalQtyBilled === totalQtyReceived;
    const amountMatch = Math.abs(Number(po.totalAmount || 0) - Number(invoice.amount || 0)) <= 10;
    res.json({
      matchStatus: qtyMatch && amountMatch ? 'MATCHED' : 'DISCREPANCY_FOUND', poNo: po.poNo, invoiceNo: invoice.invoiceNo,
      poAmount: po.totalAmount, invoiceAmount: invoice.amount, totalQtyOrdered, totalQtyReceived, totalQtyBilled,
      qtyMatch, amountMatch,
      discrepancyReason: qtyMatch && amountMatch ? null : (!qtyMatch
        ? `Quantity Discrepancy: Received ${totalQtyReceived}, Billed ${totalQtyBilled}, Ordered ${totalQtyOrdered}`
        : `Price Discrepancy: PO Total ₹${po.totalAmount} vs Invoice Total ₹${invoice.amount}`)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
