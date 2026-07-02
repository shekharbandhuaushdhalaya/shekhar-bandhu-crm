const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');

const router = express.Router();

// GET /api/orders — List all orders (Authenticated)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/status — Update order status (Authenticated)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'processing', 'shipped', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id — Update full order details (Authenticated)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, shippingAddress, status, totalAmount, courierName, trackingId, courierLink, adminNotes } = req.body;
    
    const updateFields = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (email !== undefined) updateFields.email = email.trim().toLowerCase();
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (shippingAddress !== undefined) updateFields.shippingAddress = shippingAddress.trim();
    if (status !== undefined) {
      if (!['pending', 'processing', 'shipped', 'delivered'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      updateFields.status = status;
    }
    if (totalAmount !== undefined) updateFields.totalAmount = Number(totalAmount);
    if (courierName !== undefined) updateFields.courierName = courierName.trim();
    if (trackingId !== undefined) updateFields.trackingId = trackingId.trim();
    if (courierLink !== undefined) updateFields.courierLink = courierLink.trim();
    if (adminNotes !== undefined) updateFields.adminNotes = adminNotes.trim();

    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/orders/public/create — Create an order from public website storefront (Unauthenticated)
router.post('/public/create', async (req, res) => {
  try {
    const { name, email, phone, shippingAddress, items } = req.body;
    if (!name || !email || !phone || !shippingAddress || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields or items list' });
    }

    // Validate items and verify stocks/prices
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) {
        return res.status(404).json({ error: `Product not found: ${item.name || item.productId}` });
      }
      
      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for item: ${dbProd.name}` });
      }

      // Track price from DB to avoid price manipulation from frontend. Apply discount if active.
      const hasDiscount = dbProd.discount > 0;
      const price = hasDiscount 
        ? dbProd.price * (1 - dbProd.discount / 100)
        : dbProd.price;

      // Verify warehouse stock availability in CRM
      const invItems = await Inventory.find({ itemSku: dbProd.sku });
      const totalAvailable = invItems.reduce((acc, inv) => acc + (inv.qty || 0), 0);
      if (totalAvailable < qty) {
        return res.status(400).json({ error: `Insufficient stock for product: ${dbProd.name}. Available: ${totalAvailable}` });
      }

      totalAmount += price * qty;

      validatedItems.push({
        productId: dbProd._id,
        name: dbProd.name,
        qty: qty,
        price: Number(price.toFixed(2)),
        size: dbProd.size || 'Standard'
      });

      // Deduct stockLevel in Product model and Inventory model
      dbProd.stockLevel = Math.max(0, dbProd.stockLevel - qty);
      await dbProd.save();

      const inv = await Inventory.findOne({ itemSku: dbProd.sku });
      if (inv) {
        inv.qty = Math.max(0, inv.qty - qty);
        inv.val = inv.qty * dbProd.price;
        await inv.save();
      }
    }

    const newOrder = await Order.create({
      name,
      email,
      phone,
      shippingAddress,
      items: validatedItems,
      totalAmount,
      status: 'pending'
    });

    res.status(201).json({ message: 'Order placed successfully', order: newOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/public/track/:query — Public tracking search by Order ID or Phone (Unauthenticated)
router.get('/public/track/:query', async (req, res) => {
  try {
    const { query } = req.params;
    if (!query) {
      return res.status(400).json({ error: 'Tracking query is required' });
    }

    const filter = {};
    const cleanQuery = query.trim();

    // Check if the query is a valid 24-character hexadecimal MongoDB ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(cleanQuery)) {
      filter._id = cleanQuery;
    } else {
      // Otherwise, query by exact phone number match
      filter.phone = cleanQuery;
    }

    const matchedOrders = await Order.find(filter)
      .select('name status totalAmount courierName trackingId courierLink createdAt items')
      .sort({ createdAt: -1 })
      .lean();

    res.json(matchedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for financial year string
function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, 3 = Apr
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// POST /api/orders/:id/invoice — Generate Draft Sale Invoice from Order (Authenticated)
router.post('/:id/invoice', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // 1. Check if an invoice was already generated for this order to prevent duplicates
    const existingInvoice = await Invoice.findOne({ reference: order._id });
    if (existingInvoice) {
      return res.status(400).json({ error: `An invoice has already been generated for this order (Invoice No: ${existingInvoice.invoiceNo})` });
    }

    // 2. Resolve Customer (try to find matching customer in B2B database, or fallback/create)
    let customer = await Customer.findOne({
      $or: [
        { name: order.name },
        { company: order.name }
      ]
    });

    if (!customer) {
      // Create a default customer record for this web order
      customer = await Customer.create({
        name: order.name,
        company: order.name,
        email: order.email,
        phone: order.phone,
        billingAddress: { street: order.shippingAddress, city: 'Varanasi', state: 'Uttar Pradesh', pin: '221001' },
        shippingAddress: { street: order.shippingAddress, city: 'Varanasi', state: 'Uttar Pradesh', pin: '221001' },
        customerType: 'cash',
        recordTracking: 'cash_ledger'
      });
    }

    // 3. Format Invoice items
    const invoiceItems = order.items.map(item => ({
      productId: item.productId,
      name: item.name,
      boxes: item.qty, // maps quantity to boxes in invoice
      packing: 1,
      rate: item.price,
      amount: item.price * item.qty,
      size: item.size
    }));

    // 4. Generate unique invoice number
    const fy = getFinancialYearString(new Date());
    const prefix = `VP/${fy}/`;
    const lastInvoice = await Invoice.findOne({ 
      type: 'sale',
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ date: -1, createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split('/');
      if (parts.length === 3) {
        nextNum = parseInt(parts[2], 10) + 1;
      }
    }
    const invoiceNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;

    // 5. Create Draft Sale Invoice
    const newInvoice = await Invoice.create({
      type: 'sale',
      invoiceNo,
      date: new Date(),
      customerName: customer.company || customer.name,
      items: invoiceItems,
      amount: order.totalAmount,
      mode: 'kachha', // default website orders to cash/kachha ledger
      isFinalized: false,
      reference: order._id, // link back to this order
      status: 'unpaid'
    });

    res.status(201).json({ message: 'Draft invoice generated successfully', invoice: newInvoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
