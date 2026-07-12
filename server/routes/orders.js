const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');


const router = express.Router();

function checkAndAddAlerts(order, newStatus, newTrackingId, newCourierName) {
  const oldStatus = order.status;
  if (oldStatus !== newStatus) {
    let alertMsg = '';
    const tracker = newTrackingId || order.trackingId || 'N/A';
    const courier = newCourierName || order.courierName || 'Courier Service';

    if (newStatus === 'processing') {
      alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order of ₹${order.totalAmount} has been approved and is now being processed at our Varanasi factory.`;
    } else if (newStatus === 'shipped') {
      alertMsg = `[SMS/WhatsApp/Email Alert sent to ${order.phone} / ${order.email}]: Hello ${order.name}, your order has been dispatched via ${courier}. Tracking ID: ${tracker}. Monitor your delivery live!`;
    } else if (newStatus === 'delivered') {
      alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order has been successfully delivered. Thank you for choosing Shekhar Bandhu Aushadhalaya!`;
    } else if (newStatus === 'cancelled') {
      alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order has been cancelled. Please contact B2B support for details.`;
    }

    if (alertMsg) {
      if (!order.notifications) order.notifications = [];
      order.notifications.push(`${new Date().toISOString()}:: ${alertMsg}`);
    }
  }
}

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
    if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    checkAndAddAlerts(order, status);
    order.status = status;
    await order.save();

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id — Update full order details (Authenticated)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, shippingAddress, status, totalAmount, courierName, trackingId, courierLink, adminNotes } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (status !== undefined) {
      if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      checkAndAddAlerts(order, status, trackingId, courierName);
      order.status = status;
    }

    if (name !== undefined) order.name = name.trim();
    if (email !== undefined) order.email = email.trim().toLowerCase();
    if (phone !== undefined) order.phone = phone.trim();
    if (shippingAddress !== undefined) order.shippingAddress = shippingAddress.trim();
    if (totalAmount !== undefined) order.totalAmount = Number(totalAmount);
    if (courierName !== undefined) order.courierName = courierName.trim();
    if (trackingId !== undefined) order.trackingId = trackingId.trim();
    if (courierLink !== undefined) order.courierLink = courierLink.trim();
    if (adminNotes !== undefined) order.adminNotes = adminNotes.trim();

    await order.save();
    res.json(order);
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

    // Resolve Varanasi Central Depot warehouse ONCE (not inside item loop)
    const warehouse = await Warehouse.findOne({ name: /varanasi central/i });
    if (!warehouse) {
      return res.status(500).json({ error: 'Primary warehouse not configured. Please contact administration.' });
    }

    // Validate items and verify stocks/prices
    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) {
        return res.status(404).json({ error: `Product not found: ${item.name || item.productId}` });
      }
      
      const qty = parseInt(item.qty, 10);  // qty is UNITS (pieces)
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for item: ${dbProd.name}` });
      }

      // Track price from DB to avoid price manipulation from frontend. Apply discount if active.
      const hasDiscount = dbProd.discount > 0;
      const price = hasDiscount 
        ? dbProd.price * (1 - dbProd.discount / 100)
        : dbProd.price;

      // Verify warehouse stock availability in CRM
      // Sort by mfgDate ascending (FIFO: oldest batch first), then by createdAt
      const entries = await InventoryEntry.find({
        warehouseId: warehouse._id,
        productId: dbProd._id
      }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

      const totalAvailableUnits = entries.reduce((acc, e) => acc + ((e.qtyBoxes || 0) * (e.packing || 1)), 0);

      if (totalAvailableUnits < qty) {
        return res.status(400).json({ error: `Insufficient stock for product: ${dbProd.name}. Available: ${totalAvailableUnits} units` });
      }

      totalAmount += price * qty;

      validatedItems.push({
        productId: dbProd._id,
        name: dbProd.name,
        qty: qty,
        price: Number(price.toFixed(2)),
        size: dbProd.size || 'Standard'
      });

      // Deduct stockLevel in Product model (in units)
      dbProd.stockLevel = Math.max(0, dbProd.stockLevel - qty);
      await dbProd.save();

      // FIFO deduction across batches — deduct integer boxes only
      let unitsNeeded = qty;
      for (const entry of entries) {
        if (unitsNeeded <= 0) break;
        const packSize = entry.packing || 1;
        const entryUnits = (entry.qtyBoxes || 0) * packSize;
        if (entryUnits <= 0) continue;

        const deductUnits = Math.min(unitsNeeded, entryUnits);
        // Round deductBoxes to avoid float drift: floor so we never deduct more than available
        const deductBoxes = Math.floor(deductUnits / packSize);
        // If deductBoxes rounds to 0 but we still need units, take at least 1 box to cover partial
        const actualDeductBoxes = deductBoxes === 0 && deductUnits > 0 ? 1 : deductBoxes;

        entry.qtyBoxes = Math.max(0, entry.qtyBoxes - actualDeductBoxes);
        await entry.save();

        const actualDeductedUnits = actualDeductBoxes * packSize;

        // Record stock ledger entry (OUT movement) — include batchNo for traceability
        await StockLedger.create({
          productId: dbProd._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'OUT',
          qtyBoxes: -actualDeductBoxes,
          balanceBoxes: entry.qtyBoxes,
          reference: `Web Order`,
          note: `Auto-deducted via Web Order for ${name}`,
          createdBy: 'System',
          packing: packSize,
          vendorId: entry.vendorId || '',
          vendorName: entry.vendorName || '',
          batchNo: entry.batchNo || '',
        });

        unitsNeeded -= actualDeductedUnits;
      }

      // Also deduct from legacy Inventory for backwards compatibility
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

// PATCH /api/orders/:id/cancel — Cancel order & revert stock (Authenticated)
router.patch('/:id/cancel', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }
    if (order.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot cancel a delivered order' });
    }

    const warehouse = await Warehouse.findOne({ name: /varanasi central/i });

    // Revert stock for each item
    for (const item of order.items) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) continue;

      const qty = item.qty; // units

      // Revert product stockLevel
      dbProd.stockLevel += qty;
      await dbProd.save();

      // Revert legacy Inventory
      const inv = await Inventory.findOne({ itemSku: dbProd.sku });
      if (inv) {
        inv.qty += qty;
        inv.val = inv.qty * dbProd.price;
        await inv.save();
      }

      // Revert InventoryEntry — add back to unbatched/first slot for this product
      if (warehouse) {
        // Find the most recent OUT ledger entries for this product from this order to know which batches to restore
        const outLedgers = await StockLedger.find({
          productId: dbProd._id,
          warehouseId: warehouse._id,
          type: 'OUT',
          reference: 'Web Order',
        }).sort({ createdAt: -1 }).limit(10);

        if (outLedgers.length > 0) {
          // Restore using the same batch slots recorded in the ledger
          for (const ledger of outLedgers) {
            const entryToRestore = await InventoryEntry.findOne({
              warehouseId: warehouse._id,
              productId: dbProd._id,
              vendorId: ledger.vendorId || '',
              packing: ledger.packing || 1,
              batchNo: ledger.batchNo || '',
            });
            if (entryToRestore) {
              entryToRestore.qtyBoxes += Math.abs(ledger.qtyBoxes);
              await entryToRestore.save();
            }
          }
        } else {
          // Fallback: add to first available slot
          const fallbackEntry = await InventoryEntry.findOne({
            warehouseId: warehouse._id,
            productId: dbProd._id,
          });
          if (fallbackEntry) {
            const packSize = fallbackEntry.packing || 1;
            const boxesToRestore = Math.ceil(qty / packSize);
            fallbackEntry.qtyBoxes += boxesToRestore;
            await fallbackEntry.save();
          }
        }

        await StockLedger.create({
          productId: dbProd._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'IN',
          qtyBoxes: Math.ceil(qty / (dbProd.packing || 1)),
          balanceBoxes: 0, // approximate
          reference: `Order Cancel`,
          note: `Stock reverted due to cancellation of Web Order by ${order.name}`,
          createdBy: 'System',
          packing: 1,
          vendorId: '',
          vendorName: '',
        });
      }
    }

    order.status = 'cancelled';
    await order.save();
    res.json({ message: 'Order cancelled and stock reverted', order });
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
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'VP';
    const prefix = `${pfx}/${fy}/`;
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
      mode: 'pakka', // default website orders to pakka ledger
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
