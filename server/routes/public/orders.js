const express = require('express');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// POST /api/orders/public/create — Place an order from the website (no auth)
router.post('/public/create', validate(schemas.orderSchema), async (req, res) => {
  try {
    const { name, email, phone, shippingAddress, items } = req.body;
    if (!name || !email || !phone || !shippingAddress || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields or items list' });
    }

    const warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    if (!warehouse) {
      return res.status(500).json({ error: 'No warehouse configured.' });
    }

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

      const hasDiscount = dbProd.discount > 0;
      const price = hasDiscount
        ? dbProd.price * (1 - dbProd.discount / 100)
        : dbProd.price;

      const entries = await InventoryEntry.find({
        warehouseId: warehouse._id,
        productId: dbProd._id
      }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

      const totalAvailableUnits = entries.reduce((acc, e) => acc + ((e.qtyBoxes || 0) * (e.packing || 1)), 0);

      if (totalAvailableUnits < qty) {
        return res.status(400).json({ error: `Insufficient stock for product: ${dbProd.name}. Available: ${totalAvailableUnits} units` });
      }

      let totalDeductedBoxes = 0;
      let unitsNeeded = qty;
      for (const entry of entries) {
        if (unitsNeeded <= 0) break;
        const packSize = entry.packing || 1;
        const entryUnits = (entry.qtyBoxes || 0) * packSize;
        if (entryUnits <= 0) continue;

        const deductUnits = Math.min(unitsNeeded, entryUnits);
        const deductBoxes = Math.floor(deductUnits / packSize);
        const actualDeductUnits = deductBoxes * packSize;

        entry.qtyBoxes -= deductBoxes;
        await entry.save();

        await StockLedger.create({
          productId: dbProd._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'OUT',
          qtyBoxes: deductBoxes,
          balanceBoxes: entry.qtyBoxes,
          reference: `Website Order: ${name}`,
          note: `Web sale — ${item.name}`,
          createdBy: 'Website',
          packing: packSize,
          batchNo: entry.batchNo,
        });

        totalDeductedBoxes += deductBoxes;
        unitsNeeded -= actualDeductUnits;
      }

      validatedItems.push({
        productId: dbProd._id,
        name: dbProd.name,
        qty,
        price,
        size: dbProd.size,
        deductedBoxes: totalDeductedBoxes,
      });

      totalAmount += price * qty;

      dbProd.stockLevel = Math.max(0, dbProd.stockLevel - totalDeductedBoxes);
      await dbProd.save();
    }

    const order = await Order.create({
      name, email, phone, shippingAddress,
      items: validatedItems,
      totalAmount,
      status: 'pending',
    });

    if (req.io) {
      req.io.emit('new_web_order', order);
      req.io.emit('inventory_updated', { type: 'web_order', orderId: order._id });
    }

    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/orders/track/:phone — Track orders by phone (no auth)
router.get('/public/track/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const orders = await Order.find({ phone }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/public/webhook/storefront — Receive payment webhooks from storefronts (Razorpay/Stripe/Shopify)
router.post('/public/webhook/storefront', async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const { orderNo, customerName, amount, items } = req.body; 

    // Handle WooCommerce / Shopify checkout style or generic payment webhook payload:
    const targetOrderNo = orderNo || `WEB-${Date.now().toString().slice(-6)}`;
    const targetCustomerName = customerName || 'Online Store Customer';
    const targetAmount = parseFloat(amount) || 0;
    const targetItems = items || []; // [{ productId, name, qty, price }]

    const warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    if (!warehouse) {
      return res.status(500).json({ error: 'No warehouse configured for inventory deduction.' });
    }

    // Deduct stock for all items
    const invoiceItems = [];
    for (const item of targetItems) {
      const dbProd = await Product.findById(item.productId);
      if (dbProd) {
        const qty = parseInt(item.qty, 10) || 1;
        const price = parseFloat(item.price) || dbProd.price || 0;

        // FIFO Inventory deduction
        const entries = await InventoryEntry.find({
          warehouseId: warehouse._id,
          productId: dbProd._id
        }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

        let remainingQty = qty;
        for (const entry of entries) {
          if (remainingQty <= 0) break;
          const packSize = entry.packing || 1;
          const entryUnits = (entry.qtyBoxes || 0) * packSize;
          if (entryUnits <= 0) continue;

          const deductUnits = Math.min(remainingQty, entryUnits);
          const deductBoxes = Math.floor(deductUnits / packSize);
          entry.qtyBoxes -= deductBoxes;
          await entry.save();

          await StockLedger.create({
            productId: dbProd._id,
            warehouseId: warehouse._id,
            warehouseName: warehouse.name,
            type: 'OUT',
            qtyBoxes: deductBoxes,
            balanceBoxes: entry.qtyBoxes,
            reference: `Storefront Webhook Order: #${targetOrderNo}`,
            note: `Online Sale — ${dbProd.name}`,
            createdBy: 'Storefront Webhook',
            packing: packSize,
            batchNo: entry.batchNo,
          });

          remainingQty -= (deductBoxes * packSize);
        }

        invoiceItems.push({
          productId: dbProd._id,
          name: dbProd.name,
          qty,
          boxes: qty,
          unit: dbProd.unit || 'pcs',
          packing: 1,
          rate: price,
          gstRate: dbProd.gstRate || 18,
          hsnCode: dbProd.hsnCode || ''
        });

        dbProd.stockLevel = Math.max(0, dbProd.stockLevel - qty);
        await dbProd.save();
      }
    }

    // Auto-create a finalized paid Invoice
    const invoice = await Invoice.create({
      invoiceNo: `INV-${targetOrderNo}`,
      date: new Date(),
      customerName: targetCustomerName,
      amount: targetAmount,
      status: 'paid',
      mode: 'cash',
      type: 'sale',
      isFinalized: true,
      items: invoiceItems,
      baseAmount: targetAmount / 1.18,
      cgst: (targetAmount - targetAmount / 1.18) / 2,
      sgst: (targetAmount - targetAmount / 1.18) / 2,
      amountPaid: targetAmount
    });

    if (req.io) {
      req.io.emit('new_web_order', { orderNo: targetOrderNo, customerName: targetCustomerName, amount: targetAmount });
      req.io.emit('inventory_updated', { type: 'webhook', invoiceId: invoice._id });
    }

    res.status(201).json({ message: 'Storefront webhook processed and invoice generated successfully', invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
