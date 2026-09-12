const express = require('express');
const Order = require('../../models/Order');
const Challan = require('../../models/Challan');
const Invoice = require('../../models/Invoice');
const Dispatch = require('../../models/Dispatch');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

function addStatusAlert(order, newStatus) {
  if (order.status === newStatus) return;
  let message = '';
  if (newStatus === 'processing') message = `[Order update]: ${order.orderNo || order._id} is being processed.`;
  else if (newStatus === 'cancelled') message = `[Order update]: ${order.orderNo || order._id} was cancelled.`;
  if (message) {
    order.notifications = order.notifications || [];
    order.notifications.push(`${new Date().toISOString()}:: ${message}`);
  }
}

async function enrichOrders(orders) {
  if (!orders.length) return [];
  const orderIds = orders.map(o => o._id);
  const challans = await Challan.find({ salesOrderId: { $in: orderIds } }).select('_id salesOrderId challanNo status inventoryPostingStatus invoiceId invoiceNo').lean();
  const challanIds = challans.map(c => c._id);
  const invoiceIds = [...new Set(orders.flatMap(o => (o.invoiceIds || []).map(String)).concat(challans.map(c => c.invoiceId).filter(Boolean).map(String)))];
  const [invoices, dispatches] = await Promise.all([
    invoiceIds.length ? Invoice.find({ _id: { $in: invoiceIds } }).select('_id invoiceNo status isFinalized sourceDocId').lean() : [],
    challanIds.length ? Dispatch.find({ challanId: { $in: challanIds } }).select('_id challanId dispatchNo status trackingId courierName deliveredAt').lean() : [],
  ]);
  const challansByOrder = new Map();
  for (const c of challans) {
    const key = String(c.salesOrderId);
    if (!challansByOrder.has(key)) challansByOrder.set(key, []);
    challansByOrder.get(key).push(c);
  }
  const invoicesById = new Map(invoices.map(i => [String(i._id), i]));
  const dispatchesByChallan = new Map();
  for (const d of dispatches) {
    const key = String(d.challanId);
    if (!dispatchesByChallan.has(key)) dispatchesByChallan.set(key, []);
    dispatchesByChallan.get(key).push(d);
  }
  return orders.map(order => {
    const cs = challansByOrder.get(String(order._id)) || [];
    const invoiceSet = new Map();
    for (const id of order.invoiceIds || []) { const inv = invoicesById.get(String(id)); if (inv) invoiceSet.set(String(inv._id), inv); }
    for (const c of cs) { const inv = c.invoiceId ? invoicesById.get(String(c.invoiceId)) : null; if (inv) invoiceSet.set(String(inv._id), inv); }
    const ds = cs.flatMap(c => dispatchesByChallan.get(String(c._id)) || []);
    const invoiceList = [...invoiceSet.values()];
    return {
      ...order,
      challans: cs,
      invoices: invoiceList,
      dispatches: ds,
      hasChallan: cs.length > 0,
      challanNo: cs[0]?.challanNo || null,
      hasInvoice: invoiceList.length > 0,
      invoiceNo: invoiceList[0]?.invoiceNo || null,
      hasDispatch: ds.length > 0,
      dispatchNo: ds[0]?.dispatchNo || null,
    };
  });
}

router.get('/', authorize('order:view'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const paginate = req.query.page != null;
    const filter = {};
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.status) filter.status = req.query.status;
    let query = Order.find(filter).sort({ createdAt: -1 });
    if (paginate) query = query.skip((page - 1) * limit).limit(limit);
    const orders = await query.lean();
    const data = await enrichOrders(orders);
    if (!paginate) return res.json(data);
    const total = await Order.countDocuments(filter);
    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/:id/status', authorize('order:edit'), async (req, res) => {
  try {
    const { status } = req.body;
    if (['shipped','delivered'].includes(status)) return res.status(409).json({ error: 'Shipping and delivery status are controlled by Dispatch records.', code: 'DISPATCH_STATUS_AUTHORITY' });
    if (status === 'cancelled') return res.status(409).json({ error: 'Use the dedicated cancel action so Challan dependencies can be checked.', code: 'USE_CANCEL_ENDPOINT' });
    if (!['pending','processing','draft'].includes(status)) return res.status(400).json({ error: 'Invalid manually assignable status' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    addStatusAlert(order, status);
    order.status = status;
    await order.save();
    if (req.io) req.io.emit('order_updated', { type: 'status_changed', id: order._id });
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id', authorize('order:edit'), validate(schemas.orderSchema.partial()), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const posted = await Challan.exists({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' });
    const protectedFields = ['items','customerId','warehouseId','totalAmount','name'];
    if (posted && protectedFields.some(field => Object.prototype.hasOwnProperty.call(req.body, field))) {
      return res.status(409).json({ error: 'Commercial/order lines cannot be changed after physical fulfillment has started.', code: 'ORDER_ALREADY_FULFILLED' });
    }
    if (req.body.status && ['shipped','delivered','cancelled'].includes(req.body.status)) {
      return res.status(409).json({ error: 'Shipment/delivery is controlled by Dispatch; cancellation uses the cancel endpoint.', code: 'ORDER_STATUS_PROTECTED' });
    }
    const allowed = ['email','phone','shippingAddress','billingAddress','customerPoNo','expectedDeliveryDate','priority','adminNotes','courierName','trackingId','courierLink','status'];
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(req.body, field)) order[field] = req.body[field];
    await order.save();
    if (req.io) req.io.emit('order_updated', { type: 'updated', id: order._id });
    res.json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/:id/approve', authorize('order:approve'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') return res.status(409).json({ error: 'Cancelled orders cannot be approved' });
    order.approvalStatus = 'approved';
    order.approvedBy = req.user?.name || req.user?.email || 'User';
    order.approvedAt = new Date();
    order.rejectionReason = '';
    if (order.status === 'pending') order.status = 'processing';
    await order.save();
    if (req.io) req.io.emit('order_updated', { type: 'approved', id: order._id });
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/:id/reject', authorize('order:approve'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (await Challan.exists({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' })) {
      return res.status(409).json({ error: 'An order with posted Challans cannot be rejected. Reverse the dependent Challans first.', code: 'POSTED_CHALLAN_EXISTS' });
    }
    order.approvalStatus = 'rejected';
    order.rejectionReason = String(req.body.reason || '').slice(0, 500);
    order.status = 'cancelled';
    await order.save();
    if (req.io) req.io.emit('order_updated', { type: 'rejected', id: order._id });
    res.json(order);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/:id/cancel', authorize('order:cancel'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (await Challan.exists({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' })) {
      return res.status(409).json({ error: 'This order has posted Challans. Reverse those physical movements before cancelling the order.', code: 'POSTED_CHALLAN_EXISTS' });
    }
    addStatusAlert(order, 'cancelled');
    order.status = 'cancelled';
    await order.save();
    if (req.io) req.io.emit('order_updated', { type: 'cancelled', id: order._id });
    await logAction({ action: 'CANCEL_ORDER', description: `Cancelled order ${order.orderNo || order._id} for ${order.name}`, details: { orderId: order._id }, req });
    res.json({ message: 'Order cancelled. No inventory was changed because Sales Orders never move stock.', order });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Legacy public and direct-invoice endpoints are deliberately retired. Public ordering lives under /api/public/orders and /api/portal/orders.
router.post('/public/create', (_req, res) => res.status(410).json({ error: 'This endpoint is retired. Use the authenticated customer portal.', code: 'LEGACY_ORDER_ENDPOINT_RETIRED' }));
router.get('/public/track/:query', (_req, res) => res.status(410).json({ error: 'Phone-based public tracking is retired. Use customer portal tracking.', code: 'LEGACY_TRACKING_RETIRED' }));
router.post('/:id/invoice', authorize('invoice:create'), (_req, res) => res.status(410).json({ error: 'Direct Order → Invoice conversion is retired. Fulfill the order through a posted Sale Challan, then create the invoice from that Challan.', code: 'CHALLAN_REQUIRED' }));

module.exports = router;
