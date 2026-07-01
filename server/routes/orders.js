const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

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
    const { name, email, phone, shippingAddress, status, totalAmount } = req.body;
    
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

module.exports = router;
