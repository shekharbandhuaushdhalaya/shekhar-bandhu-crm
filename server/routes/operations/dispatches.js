const express = require('express');
const router = express.Router();
const Dispatch = require('../../models/Dispatch');
const InventoryEntry = require('../../models/InventoryEntry');
const Challan = require('../../models/Challan');
const Invoice = require('../../models/Invoice');
const Order = require('../../models/Order');
const { validate } = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const schemas = require('../../validation/schemas');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

const TRANSITIONS = {
  pending: new Set(['pending', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned']),
  dispatched: new Set(['dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned']),
  in_transit: new Set(['in_transit', 'out_for_delivery', 'delivered', 'returned']),
  out_for_delivery: new Set(['out_for_delivery', 'delivered', 'returned']),
  delivered: new Set(['delivered']),
  returned: new Set(['returned']),
};

async function nextDispatchNo() {
  return generateAtomicDocumentNumber('dispatchNo', 'DSP-', 5);
}

function logisticsFields(body = {}) {
  const allowed = ['transporter','lrNo','vehicleNo','courierName','trackingId','trackingUrl','totalBoxes','totalWeight','freightCharge','status','notes','dispatchDate'];
  return Object.fromEntries(allowed.filter(k => Object.prototype.hasOwnProperty.call(body, k)).map(k => [k, body[k]]));
}

const { recomputeOrderLogisticsFromChallan } = require('../../services/dispatchService');
async function hydrateDispatchSource(challanId) {
  const challan = await Challan.findOne({
    _id: challanId,
    challanType: 'sale',
    status: 'finalized',
    inventoryPostingStatus: 'posted',
  }).lean();
  if (!challan) {
    const error = new Error('A posted Sale Challan is required before creating Dispatch');
    error.code = 'POSTED_CHALLAN_REQUIRED';
    throw error;
  }
  if (await Dispatch.exists({ challanId: challan._id })) {
    const error = new Error('A Dispatch already exists for this Challan');
    error.code = 'DISPATCH_ALREADY_EXISTS';
    throw error;
  }
  const order = challan.salesOrderId ? await Order.findById(challan.salesOrderId).lean() : null;
  const invoice = challan.invoiceId ? await Invoice.findById(challan.invoiceId).lean() : null;
  return { challan, order, invoice };
}

router.get('/', authorize('dispatch:view'), async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { customerName: new RegExp(search, 'i') },
      { dispatchNo: new RegExp(search, 'i') },
      { invoiceNo: new RegExp(search, 'i') },
      { challanNo: new RegExp(search, 'i') },
      { lrNo: new RegExp(search, 'i') },
      { trackingId: new RegExp(search, 'i') },
    ];
    res.json(await Dispatch.find(filter).sort({ createdAt: -1 }).lean());
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', authorize('dispatch:create'), validate(schemas.dispatchSchema), async (req, res) => {
  try {
    if (!req.body.challanId) return res.status(400).json({ error: 'challanId is required', code: 'CHALLAN_REQUIRED' });
    const { challan, order, invoice } = await hydrateDispatchSource(req.body.challanId);
    const dispatchNo = await nextDispatchNo();
    const physicalItems = (challan.items || []).map(item => ({
      productId: item.productId,
      name: item.name,
      qty: Number(item.qty || 0),
      packing: Number(item.packing || 1),
      batchNo: item.batchNo || '',
    }));
    const totalBoxes = physicalItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const dispatch = await Dispatch.create({
      dispatchNo,
      challanId: challan._id,
      challanNo: challan.challanNo,
      invoiceId: invoice?._id || null,
      invoiceNo: invoice?.invoiceNo || challan.invoiceNo || '',
      customerName: order?.name || challan.partyName || '',
      customerPhone: order?.phone || '',
      shippingAddress: order?.shippingAddress || challan.shippingAddress || '',
      items: physicalItems,
      totalBoxes,
      ...logisticsFields(req.body),
    });
    await recomputeOrderLogisticsFromChallan(challan._id);
    if (req.io) req.io.emit('dispatch_updated', { type: 'created', id: dispatch._id });
    res.status(201).json(dispatch);
  } catch (error) {
    const status = ['POSTED_CHALLAN_REQUIRED','DISPATCH_ALREADY_EXISTS'].includes(error.code) ? 409 : 400;
    res.status(status).json({ error: error.message, code: error.code || 'DISPATCH_CREATE_FAILED' });
  }
});

router.patch('/:id', authorize('dispatch:edit'), validate(schemas.dispatchSchema.partial()), async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    const immutable = ['challanId','challanNo','invoiceId','invoiceNo','customerName','customerPhone','shippingAddress','items'];
    if (immutable.some(k => Object.prototype.hasOwnProperty.call(req.body, k))) {
      return res.status(409).json({ error: 'Dispatch source/customer/items are immutable after creation', code: 'DISPATCH_SOURCE_IMMUTABLE' });
    }
    if (req.body.status) {
      const allowed = TRANSITIONS[dispatch.status] || new Set([dispatch.status]);
      if (!allowed.has(req.body.status)) return res.status(409).json({ error: `Invalid dispatch status transition: ${dispatch.status} → ${req.body.status}`, code: 'INVALID_DISPATCH_TRANSITION' });
    }
    Object.assign(dispatch, logisticsFields(req.body));
    if (dispatch.status === 'delivered' && !dispatch.deliveredAt) dispatch.deliveredAt = new Date();
    await dispatch.save();
    await recomputeOrderLogisticsFromChallan(dispatch.challanId);
    if (req.io) req.io.emit('dispatch_updated', { type: 'updated', id: dispatch._id });
    res.json(dispatch);
  } catch (error) { res.status(400).json({ error: error.message, code: error.code || 'DISPATCH_UPDATE_FAILED' }); }
});

router.delete('/:id', authorize('dispatch:delete'), async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (dispatch.status !== 'pending') return res.status(409).json({ error: 'Only a pending Dispatch may be deleted. Posted logistics history is immutable.', code: 'DISPATCH_IMMUTABLE' });
    const challanId = dispatch.challanId;
    await dispatch.deleteOne();
    if (challanId) await recomputeOrderLogisticsFromChallan(challanId);
    if (req.io) req.io.emit('dispatch_updated', { type: 'deleted', id: req.params.id });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/dead-stock', authorize('inventory:view'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 90 * 86400000);
    const entries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 }, qcStatus: 'approved' })
      .populate('productId', 'name sku price size')
      .populate('warehouseId', 'name')
      .lean();
    const StockLedger = require('../../models/StockLedger');
    const deadStock = [];
    for (const entry of entries) {
      const lastMovement = await StockLedger.findOne({ productId: entry.productId?._id || entry.productId, warehouseId: entry.warehouseId?._id || entry.warehouseId }).sort({ createdAt: -1 }).select('createdAt date').lean();
      const lastDate = lastMovement?.date || lastMovement?.createdAt || entry.updatedAt || entry.createdAt;
      if (new Date(lastDate) < cutoff) deadStock.push({
        productId: entry.productId?._id || entry.productId,
        productName: entry.productId?.name || 'Unknown', productSku: entry.productId?.sku || '', price: entry.productId?.price || 0, size: entry.productId?.size || '',
        warehouseId: entry.warehouseId?._id || entry.warehouseId, warehouseName: entry.warehouseId?.name || 'Default', qtyBoxes: entry.qtyBoxes,
        stockValue: Number(entry.qtyBoxes || 0) * Number(entry.productId?.price || 0), lastMovementDate: lastDate,
        daysSinceMovement: Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000),
      });
    }
    deadStock.sort((a,b) => b.daysSinceMovement - a.daysSinceMovement);
    res.json(deadStock);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
