const express = require('express');
const Order = require('../../models/Order');
const Challan = require('../../models/Challan');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const SalesScheme = require('../../models/SalesScheme');
const SalesReturn = require('../../models/SalesReturn');
const CommissionRule = require('../../models/CommissionRule');
const SystemSettings = require('../../models/SystemSettings');
const { authorize } = require('../../middleware/authorize');
const { money, getSalesPolicy } = require('../../services/salesPricingService');
const { createSalesOrder, createDraftFulfillment } = require('../../services/salesOrderService');
const { createSplitPayments } = require('../../services/paymentPostingService');
const { createSalesReturn, postSalesReturn, reverseSalesReturn } = require('../../services/salesReturnService');
const idempotency = require('../../middleware/requiredIdempotency');

const router = express.Router();
const nonExpiredFilter = () => ({ $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gt: new Date() } }] });

router.get('/dashboard', authorize('report:view'), async (req, res) => {
  try {
    const start = req.query.from ? new Date(req.query.from) : new Date(new Date().setHours(0,0,0,0));
    const end = req.query.to ? new Date(req.query.to) : new Date();
    const [orders, invoices, payments, pendingApprovals, partials] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      Invoice.find({ type: 'sale', date: { $gte: start, $lte: end }, isFinalized: true }).lean(),
      Payment.find({ type: 'receive', date: { $gte: start, $lte: end } }).lean(),
      Order.countDocuments({ approvalStatus: 'pending_approval' }),
      Order.countDocuments({ status: 'partially_fulfilled' }),
    ]);
    const bySource = {};
    for (const order of orders) {
      const key = order.sourcePersonName || order.mrName || order.sourceType || 'Direct';
      bySource[key] = money((bySource[key] || 0) + Number(order.totalAmount || 0));
    }
    res.json({ period: { start, end }, kpis: { sales: money(invoices.reduce((s,i)=>s+Number(i.amount||0),0)), orders: orders.length, invoices: invoices.length, collections: money(payments.reduce((s,p)=>s+Number(p.amount||0),0)), pendingApprovals, partiallyFulfilled: partials }, bySource });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/orders', idempotency, authorize('order:create'), async (req, res) => {
  try {
    const result = await createSalesOrder({ ...req.body, orderChannel: req.body.orderChannel || 'crm' });
    res.status(201).json(result);
  } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code || 'ORDER_CREATE_FAILED' }); }
});

router.post('/orders/:id/fulfill', idempotency, authorize('order:fulfill'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    const challan = await createDraftFulfillment(order, req.body);
    res.status(201).json({ challan, message: 'Draft Challan prepared. Finalize it to move physical stock.' });
  } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code || 'FULFILLMENT_CREATE_FAILED' }); }
});

router.post('/orders/:id/reconcile-fulfillment', authorize('order:fulfill'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const challans = await Challan.find({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' }).lean();
    for (const item of order.items) {
      item.fulfilledQty = challans.flatMap(c => c.items || []).filter(i => String(i.productId) === String(item.productId)).reduce((sum, i) => sum + Number(i.qty || 0), 0);
      item.backorderedQty = Math.max(0, Number(item.qty || 0) + Number(item.freeQty || 0) - Number(item.fulfilledQty || 0));
    }
    const done = order.items.every(i => Number(i.backorderedQty || 0) <= 0);
    const any = order.items.some(i => Number(i.fulfilledQty || 0) > 0);
    order.status = done ? 'fulfilled' : any ? 'partially_fulfilled' : 'processing';
    await order.save();
    res.json(order);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/invoices/:id/split-payment', idempotency, authorize('payment:create'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale', isFinalized: true });
    if (!invoice || !invoice.customerId) return res.status(404).json({ error: 'Finalized customer-linked Sale Invoice not found', code: 'INVOICE_NOT_FOUND' });
    const tenders = Array.isArray(req.body.tenders) ? req.body.tenders.filter(t => Number(t.amount || 0) > 0) : [];
    if (!tenders.length) return res.status(400).json({ error: 'At least one payment tender is required', code: 'TENDERS_REQUIRED' });
    const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
    const total = money(tenders.reduce((sum, t) => sum + Number(t.amount || 0), 0));
    if (total > outstanding + 0.01) return res.status(409).json({ error: `Payment total ${total} exceeds balance ${outstanding}`, code: 'PAYMENT_EXCEEDS_BALANCE' });
    const result = await createSplitPayments({ invoiceId: invoice._id, tenders, actorName: req.user?.name || 'System' });
    if (req.io) req.io.emit('payment_updated', { type: 'split_payment', invoiceId: invoice._id });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message, code: error.code || 'SPLIT_PAYMENT_FAILED' }); }
});

router.post('/returns', authorize('salesreturn:create'), async (req, res) => {
  try { res.status(201).json(await createSalesReturn(req.body)); }
  catch (error) { res.status(error.code?.includes('NOT_FOUND') ? 404 : 400).json({ error: error.message, code: error.code || 'RETURN_CREATE_FAILED' }); }
});
router.post('/returns/:id/post', idempotency, authorize('salesreturn:post'), async (req, res) => {
  try {
    const result = await postSalesReturn(req.params.id, { id: req.user?.id, name: req.user?.name || 'System' });
    if (req.io) { req.io.emit('inventory_updated', { type: 'sales_return_posted', returnId: req.params.id }); req.io.emit('invoice_updated', { type: 'sales_return_credit', returnId: req.params.id }); }
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message, code: error.code || 'RETURN_POST_FAILED' }); }
});
router.post('/returns/:id/reverse', idempotency, authorize('salesreturn:reverse'), async (req, res) => {
  try {
    const result = await reverseSalesReturn(req.params.id, { id: req.user?.id, name: req.user?.name || 'System' }, req.body.reason || '');
    if (req.io) req.io.emit('inventory_updated', { type: 'sales_return_reversed', returnId: req.params.id });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message, code: error.code || 'RETURN_REVERSE_FAILED' }); }
});
router.get('/returns', authorize('salesreturn:view'), async (req, res) => {
  try { res.json(await SalesReturn.find({}).sort({ createdAt: -1 }).limit(200).lean()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/schemes', authorize('pricing:view'), async (req, res) => res.json(await SalesScheme.find({}).sort({ createdAt: -1 }).lean()));
router.post('/schemes', authorize('pricing:edit'), async (req, res) => { try { res.status(201).json(await SalesScheme.create(req.body)); } catch (error) { res.status(400).json({ error: error.message }); } });
router.put('/schemes/:id', authorize('pricing:edit'), async (req, res) => { try { res.json(await SalesScheme.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })); } catch (error) { res.status(400).json({ error: error.message }); } });

router.get('/commission-rules', authorize('report:view'), async (req, res) => res.json(await CommissionRule.find({}).sort({ createdAt: -1 }).lean()));
router.post('/commission-rules', authorize('settings:edit'), async (req, res) => { try { res.status(201).json(await CommissionRule.create(req.body)); } catch (error) { res.status(400).json({ error: error.message }); } });
router.get('/commissions', authorize('report:view'), async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const orders = await Order.find({ createdAt: { $gte: from, $lte: to }, status: { $nin: ['draft','cancelled'] }, sourcePersonId: { $ne: null } }).lean();
    const rules = await CommissionRule.find({ active: true, validFrom: { $lte: to }, $or: [{ validUntil: null }, { validUntil: { $gte: from } }] }).lean();
    const rows = orders.map(order => {
      let rate = 0;
      const rule = rules.find(r => (!r.personId || String(r.personId) === String(order.sourcePersonId)) && r.basis === 'net_sales');
      if (rule) {
        rate = Number(rule.percent || 0);
        const slab = (rule.slabs || []).find(s => Number(order.totalAmount) >= Number(s.min || 0) && (s.max == null || Number(order.totalAmount) <= Number(s.max)));
        if (slab) rate = Number(slab.percent || rate);
      }
      return { orderId: order._id, orderNo: order.orderNo, personId: order.sourcePersonId, personName: order.sourcePersonName || order.mrName, netSales: order.totalAmount, rate, commission: money(Number(order.totalAmount) * rate / 100) };
    });
    res.json({ from, to, rows, total: money(rows.reduce((sum, row) => sum + row.commission, 0)) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/policy', authorize('pricing:view'), async (req, res) => { try { res.json(await getSalesPolicy()); } catch (error) { res.status(500).json({ error: error.message }); } });
router.put('/policy', authorize('pricing:edit'), async (req, res) => {
  try {
    const current = await SystemSettings.findOne({ key: 'company_config' });
    const policy = { autoApproveBelow: Number(req.body.autoApproveBelow ?? 50000), maxAutoDiscountPercent: Number(req.body.maxAutoDiscountPercent ?? 10), blockCreditLimit: req.body.blockCreditLimit !== false, allowBackorder: req.body.allowBackorder !== false };
    const settings = current || new SystemSettings({ key: 'company_config' });
    settings.salesPolicy = policy; settings.markModified('salesPolicy'); await settings.save(); res.json(policy);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/availability/:productId', authorize('inventory:view'), async (req, res) => {
  try {
    const filter = { productId: req.params.productId, qtyBoxes: { $gt: 0 }, qcStatus: 'approved', ...nonExpiredFilter() };
    if (req.query.warehouseId) filter.warehouseId = req.query.warehouseId;
    const rows = await InventoryEntry.find(filter).sort({ expiryDate: 1, mfgDate: 1, createdAt: 1 }).lean();
    res.json(rows.map(r => ({ _id: r._id, warehouseId: r.warehouseId, warehouseName: r.warehouseName, batchNo: r.batchNo || '', qtyBoxes: r.qtyBoxes, packing: r.packing || 1, mfgDate: r.mfgDate, expiryDate: r.expiryDate, qcStatus: r.qcStatus, vendorId: r.vendorId || '', vendorName: r.vendorName || '' })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/quick-sale', idempotency, authorize('order:create'), async (req, res) => {
  try {
    const { order, credit, policy } = await createSalesOrder({ ...req.body, orderChannel: 'crm' });
    if (order.approvalRequired) {
      return res.status(202).json({ order, challan: null, credit, policy, message: 'Order created and sent for approval. Challan will be prepared after approval.' });
    }
    const fulfillmentItems = order.items.map((item) => ({ productId: item.productId, qty: Number(item.qty || 0) + Number(item.freeQty || 0), packing: Number((req.body.items || []).find(r => String(r.productId) === String(item.productId))?.packing || 1), batchNo: (req.body.items || []).find(r => String(r.productId) === String(item.productId))?.batchNo, vendorId: (req.body.items || []).find(r => String(r.productId) === String(item.productId))?.vendorId, inventoryEntryId: (req.body.items || []).find(r => String(r.productId) === String(item.productId))?.inventoryEntryId }));
    const challan = await createDraftFulfillment(order, { warehouseId: req.body.warehouseId, items: fulfillmentItems });
    res.status(201).json({ order, challan, credit, policy, message: 'Quick Sale prepared. Review and finalize the Challan to move stock.' });
  } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code || 'QUICK_SALE_FAILED' }); }
});

router.get('/search', authorize('report:view'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ customers: [], orders: [], challans: [], invoices: [], products: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [customers, orders, challans, invoices, products] = await Promise.all([
      Customer.find({ $or: [{ name: rx }, { company: rx }, { phone: rx }] }).limit(10).lean(),
      Order.find({ $or: [{ orderNo: rx }, { name: rx }, { phone: rx }] }).limit(10).lean(),
      Challan.find({ $or: [{ challanNo: rx }, { partyName: rx }] }).limit(10).lean(),
      Invoice.find({ $or: [{ invoiceNo: rx }, { customerName: rx }] }).limit(10).lean(),
      Product.find({ $or: [{ name: rx }, { sku: rx }] }).limit(10).lean(),
    ]);
    res.json({ customers, orders, challans, invoices, products });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/analytics', authorize('report:view'), async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const invoices = await Invoice.find({ type: 'sale', isFinalized: true, date: { $gte: from, $lte: to } }).lean();
    const byCustomer = {}, byProduct = {};
    for (const invoice of invoices) {
      const customerKey = invoice.customerName || 'Unknown';
      if (!byCustomer[customerKey]) byCustomer[customerKey] = { customer: customerKey, revenue: 0, invoices: 0 };
      byCustomer[customerKey].revenue = money(byCustomer[customerKey].revenue + Number(invoice.amount || 0));
      byCustomer[customerKey].invoices += 1;
      for (const item of invoice.items || []) {
        const productKey = item.name || String(item.productId || 'Unknown');
        if (!byProduct[productKey]) byProduct[productKey] = { product: productKey, revenue: 0, qty: 0, freeQty: 0 };
        byProduct[productKey].revenue = money(byProduct[productKey].revenue + Number(item.rate || 0) * Number(item.qty || item.boxes || 0));
        byProduct[productKey].qty += Number(item.qty || item.boxes || 0);
        byProduct[productKey].freeQty += Number(item.freeQty || 0);
      }
    }
    res.json({ from, to, customers: Object.values(byCustomer).sort((a,b) => b.revenue - a.revenue), products: Object.values(byProduct).sort((a,b) => b.revenue - a.revenue) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
