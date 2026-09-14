const express = require('express');
const Invoice = require('../../models/Invoice');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Order = require('../../models/Order');
const Challan = require('../../models/Challan');
const Dispatch = require('../../models/Dispatch');
const { authenticatePortalCustomer } = require('../../middleware/authenticatePortalCustomer');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { resolvePrice, resolveScheme, money } = require('../../services/salesPricingService');
const { createSalesOrder } = require('../../services/salesOrderService');

const router = express.Router();
router.use(authenticatePortalCustomer);

const sellableInventoryFilter = (productId) => ({
  productId,
  qtyBoxes: { $gt: 0 },
  qcStatus: 'approved',
  $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gt: new Date() } }],
});

function publicProduct(product) {
  return {
    _id: product._id,
    name: product.name,
    sku: product.sku || '',
    description: product.description || '',
    benefits: product.benefits || '',
    ingredients: product.ingredients || '',
    suggestedDosage: product.suggestedDosage || '',
    category: product.category || 'General',
    productType: product.productType || '',
    disease: product.disease || '',
    colour: product.colour || '',
    weight: product.weight || '',
    image: product.image || product.imageUrl || '',
    size: product.size || '',
    mrp: Number(product.mrp || product.price || 0),
  };
}

router.get('/invoices', async (req, res) => {
  try {
    res.json(await Invoice.find({ type: 'sale', customerId: req.customer._id }).sort({ date: -1 }).lean());
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale', customerId: req.customer._id }).lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({
      title: `TAX INVOICE ${invoice.invoiceNo}`, invoiceNo: invoice.invoiceNo, date: invoice.date,
      customerName: invoice.customerName, billingAddress: invoice.partyAddress || req.customer.billingAddress,
      items: invoice.items || [], subTotal: invoice.baseAmount || invoice.amount, cgst: invoice.cgst || 0,
      sgst: invoice.sgst || 0, igst: invoice.igst || 0, tcsAmount: invoice.tcsAmount || 0,
      grandTotal: invoice.amount || 0, amountPaid: invoice.amountPaid || 0,
      balanceDue: Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)), status: invoice.status,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/receivables-ageing', async (req, res) => {
  try {
    const invoices = await Invoice.find({ type: 'sale', customerId: req.customer._id, isFinalized: true, status: { $in: ['unpaid','partially_paid'] } }).lean();
    const now = new Date();
    const brackets = { current: 0, days31To60: 0, days61To90: 0, days90Plus: 0 };
    const rows = invoices.map(invoice => {
      const balanceDue = Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0));
      const due = invoice.dueDate ? new Date(invoice.dueDate) : new Date(invoice.date || now);
      const ageDays = Math.max(0, Math.floor((now - due) / 86400000));
      if (ageDays <= 30) brackets.current += balanceDue;
      else if (ageDays <= 60) brackets.days31To60 += balanceDue;
      else if (ageDays <= 90) brackets.days61To90 += balanceDue;
      else brackets.days90Plus += balanceDue;
      return { id: invoice._id, invoiceNo: invoice.invoiceNo, date: invoice.date, dueDate: invoice.dueDate, totalAmount: invoice.amount, balanceDue: money(balanceDue), ageDays };
    });
    Object.keys(brackets).forEach(key => { brackets[key] = money(brackets[key]); });
    res.json({ customerId: req.customer._id, customerName: req.customer.name, totalOutstanding: money(Object.values(brackets).reduce((a,b)=>a+b,0)), brackets, invoices: rows });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/orders', async (req, res) => {
  try { res.json(await Order.find({ customerId: req.customer._id }).sort({ createdAt: -1 }).lean()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/orders/:id/track', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customerId: req.customer._id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const challans = await Challan.find({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' }).select('_id challanNo').lean();
    const dispatches = challans.length ? await Dispatch.find({ challanId: { $in: challans.map(c => c._id) } }).sort({ dispatchDate: 1, createdAt: 1 }).lean() : [];
    res.json({
      orderId: order._id, orderNo: order.orderNo, orderStatus: order.status || 'processing', orderDate: order.createdAt,
      totalAmount: order.totalAmount || 0,
      tracking: dispatches.map(d => ({ dispatchId: d._id, challanId: d.challanId, challanNo: d.challanNo, status: d.status, transporter: d.transporter || '', courierName: d.courierName || '', trackingId: d.trackingId || '', trackingUrl: d.trackingUrl || '', vehicleNo: d.vehicleNo || '', lrNo: d.lrNo || '', dispatchedAt: d.dispatchDate || d.createdAt, deliveredAt: d.deliveredAt || null })),
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/me', async (req, res) => {
  const c = req.customer.toObject ? req.customer.toObject() : req.customer;
  res.json({ id: c._id, name: c.name, company: c.company, email: c.email, phone: c.phone, tradeCategory: c.tradeCategory, paymentTerms: c.paymentTerms, creditLimit: c.creditLimit || 0, billingAddress: c.billingAddress, shippingAddress: c.shippingAddress, discountPercent: c.discountPercent || 0, portalEnabled: c.portalEnabled });
});

router.get('/catalog', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 24)));
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }] } : {};
    const [products, total] = await Promise.all([Product.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
    const ids = products.map(p => p._id);
    const entries = ids.length ? await InventoryEntry.find({ productId: { $in: ids }, qtyBoxes: { $gt: 0 }, qcStatus: 'approved', $or: [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gt: new Date() } }] }).select('productId qtyBoxes').lean() : [];
    const availability = {};
    for (const entry of entries) availability[String(entry.productId)] = Number(availability[String(entry.productId)] || 0) + Number(entry.qtyBoxes || 0);
    const data = [];
    for (const product of products) {
      const pricing = await resolvePrice(req.customer, product, 1);
      const availableQty = availability[String(product._id)] || 0;
      data.push({ ...publicProduct(product), price: pricing.rate, discountPercent: pricing.discountPercent, pricingSource: pricing.pricingSource, availableQty, inStock: availableQty > 0 });
    }
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/catalog/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const qty = Math.max(1, Number(req.query.qty || 1));
    const [pricing, scheme, entries] = await Promise.all([
      resolvePrice(req.customer, product, qty), resolveScheme(req.customer, product._id, qty), InventoryEntry.find(sellableInventoryFilter(product._id)).select('qtyBoxes').lean(),
    ]);
    const availableQty = entries.reduce((sum, entry) => sum + Number(entry.qtyBoxes || 0), 0);
    res.json({ ...publicProduct(product), customerPrice: pricing, scheme: scheme ? { code: scheme.code, name: scheme.name, discountPercent: Number(scheme.discountPercent || 0), freeQty: Number(scheme.calculatedFreeQty || 0) } : null, availableQty, inStock: availableQty > 0 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/orders', async (req, res) => {
  try {
    const result = await createSalesOrder({ ...req.body, customerId: req.customer._id, orderChannel: 'website', sourceType: 'online' }, { customer: req.customer, orderChannel: 'website', sourceType: 'online', fallbackEmail: 'portal@customer.invalid' });
    res.status(result.idempotent ? 200 : 201).json({ ...result, message: result.approvalRequired ? 'Order received and awaiting approval.' : 'Order received. Goods move only after a Sale Challan is finalized.' });
  } catch (error) {
    if (error.code === 11000 && req.body.clientOrderRef) {
      const existing = await Order.findOne({ clientOrderRef: req.body.clientOrderRef, customerId: req.customer._id }).lean();
      if (existing) return res.json({ order: existing, idempotent: true });
    }
    res.status(error.code === 'PRODUCT_NOT_FOUND' ? 404 : 400).json({ error: error.message, code: error.code || 'PORTAL_ORDER_FAILED' });
  }
});

router.post('/orders/:id/repeat', async (req, res) => {
  try {
    const prior = await Order.findOne({ _id: req.params.id, customerId: req.customer._id }).lean();
    if (!prior) return res.status(404).json({ error: 'Order not found' });
    const body = {
      ...req.body,
      items: (prior.items || []).map(item => ({ productId: item.productId, qty: item.qty })),
      clientOrderRef: req.body.clientOrderRef || `repeat-${prior._id}-${Date.now()}`,
      shippingAddress: req.body.shippingAddress || prior.shippingAddress,
    };
    const result = await createSalesOrder({ ...body, customerId: req.customer._id, orderChannel: 'website', sourceType: 'existing_customer' }, { customer: req.customer, orderChannel: 'website', sourceType: 'existing_customer', fallbackEmail: 'portal@customer.invalid', notePrefix: `Website repeat of ${prior.orderNo}. ` });
    res.status(201).json(result);
  } catch (error) { res.status(error.code === 'PRODUCT_NOT_FOUND' ? 404 : 400).json({ error: error.message, code: error.code || 'PORTAL_REPEAT_FAILED' }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [orders, invoices] = await Promise.all([
      Order.find({ customerId: req.customer._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Invoice.find({ type: 'sale', customerId: req.customer._id }).sort({ date: -1 }).limit(20).lean(),
    ]);
    const outstanding = money(invoices.filter(i => i.isFinalized && ['unpaid','partially_paid'].includes(i.status)).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)), 0));
    const creditLimit = Number(req.customer.creditLimit || 0);
    res.json({ customer: { id: req.customer._id, name: req.customer.name, company: req.customer.company }, summary: { openOrders: orders.filter(o => !['fulfilled','delivered','cancelled'].includes(o.status)).length, outstanding, creditLimit, availableCredit: creditLimit > 0 ? Math.max(0, money(creditLimit - outstanding)) : null }, recentOrders: orders, recentInvoices: invoices.slice(0,10) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
