const express = require('express');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// POST /api/orders/public/create — Place a website order. NEVER moves physical stock.
router.post('/public/create', validate(schemas.orderSchema), async (req, res) => {
  try {
    const { name, email, phone, shippingAddress, items } = req.body;
    if (!name || !email || !phone || !shippingAddress || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Missing required order fields or items list' });
    }
    const validatedItems = [];
    let totalAmount = 0;
    for (const item of items) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) return res.status(404).json({ error: `Product not found: ${item.name || item.productId}` });
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: `Invalid quantity for item: ${dbProd.name}` });
      const price = dbProd.discount > 0 ? Number(dbProd.price || 0) * (1 - dbProd.discount / 100) : Number(dbProd.price || 0);
      validatedItems.push({ productId: dbProd._id, name: dbProd.name, qty, price, size: dbProd.size || '', fulfilledQty: 0, backorderedQty: qty, deductedBoxes: 0 });
      totalAmount += price * qty;
    }
    const count = await Order.countDocuments({});
    const order = await Order.create({
      orderNo: `WEB-${String(count + 1).padStart(5,'0')}`,
      name, email, phone, shippingAddress,
      items: validatedItems,
      totalAmount: Number(totalAmount.toFixed(2)),
      status: 'pending',
      sourceType: 'online'
    });
    if (req.io) req.io.emit('new_web_order', order);
    res.status(201).json({ message: 'Order placed successfully. Stock will move only when its Challan is finalized.', order });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/public/orders/track/:query — Track orders by Order ID or Phone (no auth)
router.get('/public/track/:query', async (req, res) => {
  try {
    const { query } = req.params;
    if (!query) {
      return res.status(400).json({ error: 'Tracking query is required' });
    }

    const filter = {};
    const cleanQuery = query.trim();

    if (/^[0-9a-fA-F]{24}$/.test(cleanQuery)) {
      filter._id = cleanQuery;
    } else {
      filter.phone = cleanQuery;
    }

    const matchedOrders = await Order.find(filter)
      .select('name status totalAmount courierName trackingId courierLink createdAt items')
      .sort({ createdAt: -1 })
      .lean();

    const Invoice = require('../../models/Invoice');
    const StockMovement = require('../../models/StockMovement');
    const Dispatch = require('../../models/Dispatch');

    const enrichedOrders = await Promise.all(matchedOrders.map(async (order) => {
      let courierName = order.courierName || '';
      let trackingId = order.trackingId || '';
      let courierLink = order.courierLink || '';
      let transporter = '';
      let lrNo = '';
      let vehicleNo = '';

      const invoice = await Invoice.findOne({ reference: order._id }).select('_id').lean();
      const challan = await StockMovement.findOne({ sourceDocId: order._id }).select('_id transporter lrNo vehicleNo').lean();
      
      let dispatch = null;
      if (invoice || challan) {
        const query = {};
        if (invoice && challan) {
          query.$or = [{ invoiceId: invoice._id }, { challanId: challan._id }];
        } else if (invoice) {
          query.invoiceId = invoice._id;
        } else {
          query.challanId = challan._id;
        }
        dispatch = await Dispatch.findOne(query).lean();
      }

      if (dispatch) {
        if (!courierName) courierName = dispatch.courierName || '';
        if (!trackingId) trackingId = dispatch.trackingId || '';
        if (!courierLink) courierLink = dispatch.trackingUrl || '';
        transporter = dispatch.transporter || '';
        lrNo = dispatch.lrNo || '';
        vehicleNo = dispatch.vehicleNo || '';
      }

      if (challan) {
        if (!transporter) transporter = challan.transporter || '';
        if (!lrNo) lrNo = challan.lrNo || '';
        if (!vehicleNo) vehicleNo = challan.vehicleNo || '';
      }

      return {
        ...order,
        courierName,
        trackingId,
        courierLink,
        transporter,
        lrNo,
        vehicleNo
      };
    }));

    res.json(enrichedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/public/webhook/storefront — Financial webhook only. Never deducts inventory.
router.post('/public/webhook/storefront', async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const { orderNo, customerName, amount, items } = req.body;
    const targetOrderNo = orderNo || `WEB-${Date.now().toString().slice(-6)}`;
    const targetCustomerName = customerName || 'Online Store Customer';
    const targetAmount = Number(amount || 0);
    const invoiceItems = [];
    for (const item of (items || [])) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) continue;
      const qty = Number(item.qty || 1), price = Number(item.price || dbProd.price || 0);
      invoiceItems.push({ productId: dbProd._id, name: dbProd.name, qty, boxes: qty, unit: dbProd.unit || 'pcs', packing: 1, rate: price, gstRate: dbProd.gstRate || 18, hsnCode: dbProd.hsnCode || '' });
    }
    const existing = await Invoice.findOne({ invoiceNo: `INV-${targetOrderNo}`, type: 'sale' });
    if (existing) return res.json({ message: 'Webhook already processed', invoice: existing });
    const invoice = await Invoice.create({
      invoiceNo: `INV-${targetOrderNo}`, date: new Date(), customerName: targetCustomerName,
      amount: targetAmount, status: 'paid', mode: 'cash', type: 'sale', isFinalized: true,
      deductInventory: false, sourceDocType: '', items: invoiceItems,
      baseAmount: targetAmount / 1.18, cgst: (targetAmount - targetAmount / 1.18) / 2,
      sgst: (targetAmount - targetAmount / 1.18) / 2, amountPaid: targetAmount
    });
    if (req.io) req.io.emit('new_web_order', { orderNo: targetOrderNo, customerName: targetCustomerName, amount: targetAmount });
    res.status(201).json({ message: 'Payment recorded. Physical stock remains controlled by the Sale Challan.', invoice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
