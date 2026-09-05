const express = require('express');
const Order = require('../../models/Order');
const Product = require('../../models/Product');

const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');

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
    const { page, limit } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Order.find({}).sort({ createdAt: -1 });
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }
    
    const orders = await query.lean();
    const Invoice = require('../../models/Invoice');
    const StockMovement = require('../../models/StockMovement');

    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      const invoice = await Invoice.findOne({ reference: order._id }).select('invoiceNo').lean();
      const challan = await StockMovement.findOne({ sourceDocId: order._id }).select('docNo').lean();
      
      let dispatch = null;
      const Dispatch = require('../../models/Dispatch');
      if (invoice || challan) {
        const dQuery = {};
        if (invoice && challan) {
          dQuery.$or = [{ invoiceId: invoice._id }, { challanId: challan._id }];
        } else if (invoice) {
          dQuery.invoiceId = invoice._id;
        } else {
          dQuery.challanId = challan._id;
        }
        dispatch = await Dispatch.findOne(dQuery).select('dispatchNo').lean();
      }

      return {
        ...order,
        hasInvoice: !!invoice,
        invoiceNo: invoice ? invoice.invoiceNo : null,
        hasChallan: !!challan,
        challanNo: challan ? challan.docNo : null,
        hasDispatch: !!dispatch,
        dispatchNo: dispatch ? dispatch.dispatchNo : null,
      };
    }));

    if (isPaginated) {
      const total = await Order.countDocuments({});
      return res.json({
        data: enrichedOrders,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(enrichedOrders);
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

    if (req.io) {
      req.io.emit('order_updated', { type: 'status_changed', id: order._id });
    }
    res.json(order);

    await logAction({
      action: 'ORDER_STATUS_CHANGE',
      description: `Order #${order._id} status changed to "${status}" for customer ${order.name}`,
      details: { orderId: order._id, customer: order.name, newStatus: status, amount: order.totalAmount },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id — Update full order details (Authenticated)
router.put('/:id', validate(schemas.orderSchema.partial()), async (req, res) => {
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
    if (req.io) {
      req.io.emit('order_updated', { type: 'updated', id: order._id });
    }
    res.json(order);

    await logAction({
      action: 'UPDATE_ORDER',
      description: `Updated order #${order._id} for ${order.name} — Status: ${order.status}`,
      details: { orderId: order._id, customer: order.name, status: order.status, changes: Object.keys(req.body) },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /api/orders/public/create — Create an order from public website storefront (Unauthenticated)
router.post('/public/create', validate(schemas.orderSchema), async (req, res) => {
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
      
      const qty = parseInt(item.qty, 10);  // qty is UNITS (pieces)
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for item: ${dbProd.name}` });
      }

      // Track price from DB to avoid price manipulation from frontend. Apply discount if active.
      const hasDiscount = dbProd.discount > 0;
      const price = hasDiscount 
        ? dbProd.price * (1 - dbProd.discount / 100)
        : dbProd.price;

      // Check stock across ALL warehouses
      const allEntries = await InventoryEntry.find({
        productId: dbProd._id,
        qtyBoxes: { $gt: 0 }
      }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

      const totalAvailableUnits = allEntries.reduce((acc, e) => acc + ((e.qtyBoxes || 0) * (e.packing || 1)), 0);

      if (totalAvailableUnits < qty) {
        return res.status(400).json({ error: `Insufficient stock for product: ${dbProd.name}. Available: ${totalAvailableUnits} units` });
      }

      totalAmount += price * qty;

      // Deduct via FIFO across batches — track total boxes deducted
      let totalDeductedBoxes = 0;
      let unitsNeeded = qty;
      for (const entry of allEntries) {
        if (unitsNeeded <= 0) break;
        const packSize = entry.packing || 1;
        const entryUnits = (entry.qtyBoxes || 0) * packSize;
        if (entryUnits <= 0) continue;

        const deductUnits = Math.min(unitsNeeded, entryUnits);
        const deductBoxes = Math.ceil(deductUnits / packSize);
        const actualDeductBoxes = Math.min(deductBoxes, entry.qtyBoxes || 0);
        if (actualDeductBoxes <= 0) continue;

        entry.qtyBoxes = Math.max(0, entry.qtyBoxes - actualDeductBoxes);
        await entry.save();

        const actualDeductedUnits = actualDeductBoxes * packSize;
        totalDeductedBoxes += actualDeductBoxes;

        await StockLedger.create({
          productId: dbProd._id,
          warehouseId: entry.warehouseId,
          warehouseName: entry.warehouseName,
          type: 'OUT',
          qtyBoxes: -actualDeductBoxes,
          balanceBoxes: entry.qtyBoxes,
          reference: 'Web Order',
          note: `Auto-deducted via Web Order for ${name}`,
          createdBy: 'System',
          packing: packSize,
          vendorId: entry.vendorId || '',
          vendorName: entry.vendorName || '',
          batchNo: entry.batchNo || '',
        });

        unitsNeeded -= actualDeductedUnits;
      }

      // Deduct stockLevel in BOXES (consistent with challans/stockMovements)
      dbProd.stockLevel = Math.max(0, dbProd.stockLevel - totalDeductedBoxes);
      await dbProd.save();

      validatedItems.push({
        productId: dbProd._id,
        name: dbProd.name,
        qty: qty,
        price: Number(price.toFixed(2)),
        size: dbProd.size || 'Standard',
        deductedBoxes: totalDeductedBoxes,
      });
    }

    const approvalRequired = totalAmount >= 50000;
    const newOrder = await Order.create({
      name,
      email,
      phone,
      shippingAddress,
      items: validatedItems,
      totalAmount,
      status: approvalRequired ? 'pending' : 'pending',
      approvalRequired,
      approvalStatus: approvalRequired ? 'pending_approval' : 'none'
    });

    if (req.io) {
      req.io.emit('order_updated', { type: 'created', id: newOrder._id });
    }
    res.status(201).json({ message: 'Order placed successfully', order: newOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/approve — Manager approve a large-value order
router.patch('/:id/approve', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.approvalStatus = 'approved';
    order.approvedBy = req.user ? req.user.name : 'Manager';
    order.approvedAt = new Date();
    await order.save();

    if (req.io) req.io.emit('order_updated', { type: 'approved', id: order._id });
    res.json({ message: 'Order approved successfully', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/reject — Manager reject a large-value order
router.patch('/:id/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.approvalStatus = 'rejected';
    order.rejectionReason = rejectionReason || 'Large value order rejected by manager';
    order.status = 'cancelled';
    await order.save();

    if (req.io) req.io.emit('order_updated', { type: 'rejected', id: order._id });
    res.json({ message: 'Order rejected', order });
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

    let warehouse = await Warehouse.findOne({ isDefault: true });
    if (!warehouse) {
      warehouse = await Warehouse.findOne().sort({ createdAt: 1 });
    }

    // Revert stock for each item
    for (const item of order.items) {
      const dbProd = await Product.findById(item.productId);
      if (!dbProd) continue;

      // Use stored deductedBoxes if available, else estimate
      const boxesToRestore = item.deductedBoxes || Math.ceil(item.qty / ((await InventoryEntry.findOne({ productId: dbProd._id }))?.packing || 1));

      // Revert product stockLevel (in boxes)
      dbProd.stockLevel += boxesToRestore;
      await dbProd.save();

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
            fallbackEntry.qtyBoxes += boxesToRestore;
            await fallbackEntry.save();
          }
        }

        await StockLedger.create({
          productId: dbProd._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'IN',
          qtyBoxes: boxesToRestore,
          balanceBoxes: 0,
          reference: 'Order Cancel',
          note: `Stock reverted due to cancellation of Web Order by ${order.name}`,
          createdBy: 'System',
          packing: outLedgers[0]?.packing || 1,
          vendorId: outLedgers[0]?.vendorId || '',
          vendorName: outLedgers[0]?.vendorName || '',
        });
      }
    }

    order.status = 'cancelled';
    await order.save();
    if (req.io) {
      req.io.emit('order_updated', { type: 'cancelled', id: order._id });
    }
    res.json({ message: 'Order cancelled and stock reverted', order });

    await logAction({
      action: 'CANCEL_ORDER',
      description: `Cancelled order #${order._id} for ${order.name} — Stock reverted for ${order.items.length} product(s)`,
      details: { orderId: order._id, customer: order.name, phone: order.phone, amount: order.totalAmount, items: order.items.length },
      req
    });
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
router.post('/:id/invoice', validate(schemas.invoiceSchema), async (req, res) => {
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

    // 3. Format Invoice items with GST back-calculation (MRP is tax-inclusive)
    let totalBase = 0;
    let totalTax = 0;
    const invoiceItems = [];

    for (const item of order.items) {
      const dbProd = await Product.findById(item.productId);
      const gstRate = dbProd ? (dbProd.gstRate || 18) : 18;

      const totalInclusive = item.qty * item.price;
      const itemBase = totalInclusive / (1 + gstRate / 100);
      const itemTax = totalInclusive - itemBase;
      const rateExclGst = item.price / (1 + gstRate / 100);

      totalBase += itemBase;
      totalTax += itemTax;

      invoiceItems.push({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        boxes: item.qty,
        packing: 1,
        rate: Number(rateExclGst.toFixed(2)),
        gstRate,
        amount: Number(itemBase.toFixed(2)),
        size: item.size,
        mrp: item.price
      });
    }

    const cgst = totalTax / 2;
    const sgst = totalTax / 2;
    const igst = 0; // website orders default to Uttar Pradesh (intra-state)
    const rawTotal = totalBase + cgst + sgst + igst;
    const nettTotal = Math.round(rawTotal);
    const roundOff = nettTotal - rawTotal;

    // 4. Generate unique invoice number
    const fy = getFinancialYearString(new Date());
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'VP';
    const prefix = `${pfx}/${fy}/`;
    const invoices = await Invoice.find({
      type: 'sale',
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).select('invoiceNo').lean();

    let nextNum = 1;
    if (invoices.length > 0) {
      const nums = invoices.map(inv => {
        const parts = inv.invoiceNo.split('/');
        return parts.length === 3 ? parseInt(parts[2], 10) : 0;
      }).filter(n => !isNaN(n));
      if (nums.length > 0) {
        nextNum = Math.max(...nums) + 1;
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
      amount: order.totalAmount, // keep the exact order amount
      mode: 'pakka', // default website orders to pakka ledger
      baseAmount: Number(totalBase.toFixed(2)),
      cgst: Number(cgst.toFixed(2)),
      sgst: Number(sgst.toFixed(2)),
      igst: Number(igst.toFixed(2)),
      roundOff: Number(roundOff.toFixed(2)),
      isFinalized: false,
      reference: order._id, // link back to this order
      status: 'unpaid'
    });

    if (req.io) {
      req.io.emit('invoice_updated', { type: 'created_from_order', id: newInvoice._id });
    }
    res.status(201).json({ message: 'Draft invoice generated successfully', invoice: newInvoice });

    await logAction({
      action: 'ORDER_GENERATE_INVOICE',
      description: `Generated invoice ${newInvoice.invoiceNo} from order #${order._id} for ${order.name} — ₹${order.totalAmount}`,
      details: { orderId: order._id, invoiceId: newInvoice._id, invoiceNo: newInvoice.invoiceNo, customer: order.name, amount: order.totalAmount },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
