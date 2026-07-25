const express = require('express');
const StockMovement = require('../../models/StockMovement');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const Customer = require('../../models/Customer');
const LedgerEntry = require('../../models/LedgerEntry');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// ── Customer Ledger Sync ──────────────────────────────────────────────────────
// Called when a SALE challan is dispatched.
// Updates customer regular/cash balance and creates a LedgerEntry.
async function syncCustomerLedger(movement, createdByName) {
  if (movement.type !== 'sale' || movement.direction !== 'out') return;
  const amount = movement.totalAmount || 0;
  if (!amount) return;

  const cust = await Customer.findOne({
    $or: [
      { name: movement.partyName },
      { company: movement.partyName }
    ]
  });
  if (!cust) return;

  if (cust.recordTracking === 'cash_ledger' || movement.billingMode === 'cash') {
    cust.cashBalance = (cust.cashBalance || 0) + amount;
  } else {
    cust.regularBalance = (cust.regularBalance || 0) + amount;
  }
  await cust.save();

  await LedgerEntry.create({
    partyId:    cust._id,
    partyType:  'Customer',
    partyName:  cust.company || cust.name,
    date:       movement.date || new Date(),
    mode:       movement.billingMode || 'regular',
    refModel:   'StockMovement',
    refId:      movement._id,
    refNo:      movement.docNo,
    debit:      amount,
    credit:     0,
    description: `Delivery Challan ${movement.docNo} dispatched`,
    createdBy:  createdByName || 'System',
  });
}

// Revert customer ledger on cancel
async function revertCustomerLedger(movement) {
  if (movement.type !== 'sale' || movement.direction !== 'out') return;
  const amount = movement.totalAmount || 0;
  if (!amount) return;

  const cust = await Customer.findOne({
    $or: [
      { name: movement.partyName },
      { company: movement.partyName }
    ]
  });
  if (!cust) return;

  if (cust.recordTracking === 'cash_ledger' || movement.billingMode === 'cash') {
    cust.cashBalance = Math.max(0, (cust.cashBalance || 0) - amount);
  } else {
    cust.regularBalance = Math.max(0, (cust.regularBalance || 0) - amount);
  }
  await cust.save();

  // Mark original ledger entry as reversed
  await LedgerEntry.create({
    partyId:    cust._id,
    partyType:  'Customer',
    partyName:  cust.company || cust.name,
    date:       new Date(),
    mode:       movement.billingMode || 'regular',
    refModel:   'StockMovement',
    refId:      movement._id,
    refNo:      movement.docNo,
    debit:      0,
    credit:     amount,
    description: `Reversal of Delivery Challan ${movement.docNo}`,
    createdBy:  'System',
  });
}

// ── Helpers ──

function getFinancialYearString() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m >= 4) return `${y}-${(y + 1).toString().slice(-2)}`;
  return `${y - 1}-${y.toString().slice(-2)}`;
}

async function generateDocNo() {
  const fy = getFinancialYearString();
  const last = await StockMovement.findOne({ docNo: { $regex: `^SM/${fy}/` } })
    .sort({ createdAt: -1 }).lean();
  let next = 1;
  if (last) {
    const parts = last.docNo.split('/');
    if (parts.length === 3) next = parseInt(parts[2], 10) + 1;
  }
  return `SM/${fy}/${next.toString().padStart(3, '0')}`;
}

// Deduct inventory for outbound movements
async function deductInventory(movement) {
  if (movement.direction !== 'out' || !movement.items?.length || !movement.warehouseId) return;

  const warehouse = await Warehouse.findById(movement.warehouseId);
  if (!warehouse) return;

  let isUpdatedItems = false;

  for (const item of movement.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const neededBoxes = item.qty || 0;
    const packing = item.packing || 1;

    product.stockLevel = Math.max(0, product.stockLevel - neededBoxes);
    await product.save();

    // Query inventory entries for this product in warehouse (sorted FIFO by mfgDate/expiryDate/createdAt)
    const entries = await InventoryEntry.find({
      warehouseId: warehouse._id,
      productId: product._id,
      packing
    }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

    // Check if user selected a specific batch with enough quantity
    const exactEntry = item.batchNo ? entries.find(e => e.batchNo === item.batchNo && e.qtyBoxes >= neededBoxes) : null;

    if (exactEntry) {
      exactEntry.qtyBoxes = Math.max(0, exactEntry.qtyBoxes - neededBoxes);
      await exactEntry.save();

      await StockLedger.create({
        productId: product._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'OUT',
        qtyBoxes: -neededBoxes,
        balanceBoxes: exactEntry.qtyBoxes,
        reference: movement.docNo,
        note: `${movement.type.toUpperCase()} — ${movement.docNo}`,
        createdBy: movement.createdBy || 'System',
        packing,
        batchNo: item.batchNo || '',
      });
    } else {
      // FIFO Multi-batch deduction across available batches
      let remainingNeeded = neededBoxes;
      const batchesUsed = [];

      for (const entry of entries) {
        if (remainingNeeded <= 0) break;
        if (entry.qtyBoxes <= 0) continue;

        const deduct = Math.min(remainingNeeded, entry.qtyBoxes);
        entry.qtyBoxes -= deduct;
        await entry.save();

        remainingNeeded -= deduct;
        batchesUsed.push(`${entry.batchNo || 'NO-BATCH'} (${deduct} Pcs)`);

        await StockLedger.create({
          productId: product._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'OUT',
          qtyBoxes: -deduct,
          balanceBoxes: entry.qtyBoxes,
          reference: movement.docNo,
          note: `${movement.type.toUpperCase()} — ${movement.docNo} (Batch ${entry.batchNo || 'N/A'})`,
          createdBy: movement.createdBy || 'System',
          packing,
          batchNo: entry.batchNo || '',
        });
      }

      if (batchesUsed.length > 0) {
        item.batchNo = batchesUsed.join(', ');
        isUpdatedItems = true;
      }
    }
  }

  if (isUpdatedItems) {
    await StockMovement.findByIdAndUpdate(movement._id, { items: movement.items });
  }
}

// Revert inventory on cancel/delete
async function revertInventory(movement) {
  if (movement.direction !== 'out' || !movement.items?.length || !movement.warehouseId) return;

  const warehouse = await Warehouse.findById(movement.warehouseId);
  if (!warehouse) return;

  for (const item of movement.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const boxes = item.qty || 0;
    const packing = item.packing || 1;

    product.stockLevel += boxes;
    await product.save();

    const entryQuery = {
      warehouseId: warehouse._id,
      productId: product._id,
      packing,
    };
    if (item.batchNo) entryQuery.batchNo = item.batchNo;

    let entry = await InventoryEntry.findOne(entryQuery);
    if (entry) {
      entry.qtyBoxes += boxes;
    } else {
      entry = new InventoryEntry({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: product._id,
        productType: product.productType || '',
        size: product.size || '',
        colour: product.colour || '',
        shape: product.shape || '',
        weight: product.weight || '',
        hsnCode: product.hsnCode || '',
        qtyBoxes: boxes,
        packing,
        batchNo: item.batchNo || '',
      });
    }
    await entry.save();

    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: boxes,
      balanceBoxes: entry.qtyBoxes,
      reference: movement.docNo,
      note: `REVERTED — ${movement.type.toUpperCase()} ${movement.docNo}`,
      createdBy: movement.createdBy || 'System',
      packing,
      batchNo: item.batchNo || '',
    });
  }
}

async function syncOrderLogistics(movement) {
  try {
    const Order = require('../../models/Order');
    let order = null;
    if (movement.sourceDocId) {
      order = await Order.findById(movement.sourceDocId);
    } else if (movement.type === 'order' && movement.partyName) {
      order = await Order.findOne({ name: { $regex: movement.partyName, $options: 'i' } }).sort({ createdAt: -1 });
    }

    if (order) {
      if (movement.courierName) order.courierName = movement.courierName;
      if (movement.trackingId) order.trackingId = movement.trackingId;
      if (movement.transporter && !order.courierName) order.courierName = movement.transporter;
      if (movement.status === 'dispatched') order.status = 'shipped';
      await order.save();
    }
  } catch (err) {
    console.error('Failed to sync logistics to order:', err);
  }
}

// Increase inventory for inbound movements
async function increaseInventory(movement) {
  if (movement.direction !== 'in' || !movement.items?.length || !movement.warehouseId) return;

  const warehouse = await Warehouse.findById(movement.warehouseId);
  if (!warehouse) return;

  for (const item of movement.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const boxes = item.qty || 0;
    const packing = item.packing || 1;

    product.stockLevel += boxes;
    await product.save();

    const entryQuery = {
      warehouseId: warehouse._id,
      productId: product._id,
      packing,
    };
    if (item.batchNo) entryQuery.batchNo = item.batchNo;

    let entry = await InventoryEntry.findOne(entryQuery);
    if (entry) {
      entry.qtyBoxes += boxes;
    } else {
      entry = new InventoryEntry({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: product._id,
        productType: product.productType || '',
        size: product.size || '',
        colour: product.colour || '',
        shape: product.shape || '',
        weight: product.weight || '',
        hsnCode: product.hsnCode || '',
        qtyBoxes: boxes,
        packing,
        batchNo: item.batchNo || '',
      });
    }
    await entry.save();

    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: boxes,
      balanceBoxes: entry.qtyBoxes,
      reference: movement.docNo,
      note: `${movement.type.toUpperCase()} — ${movement.docNo}`,
      createdBy: movement.createdBy || 'System',
      packing,
      batchNo: item.batchNo || '',
    });
  }
}

// ── Routes ──

// List
router.get('/', authorize('stockmovement:view'), async (req, res) => {
  try {
    const { direction, type, status, search, startDate, endDate } = req.query;
    const filter = {};
    if (direction) filter.direction = direction;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { docNo: { $regex: search, $options: 'i' } },
      { partyName: { $regex: search, $options: 'i' } }
    ];
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    const movements = await StockMovement.find(filter).sort({ createdAt: -1 }).lean();
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single
router.get('/:id', authorize('stockmovement:view'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id).lean();
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    res.json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create
router.post('/', authorize('stockmovement:create'), validate(schemas.stockMovementSchema), async (req, res) => {
  try {
    const data = req.body;
    const docNo = await generateDocNo();

    // Auto-calculate financial if not provided
    let baseAmount = data.baseAmount || 0;
    let totalTax = 0;
    if (data.items && data.direction === 'out' && !data.isFree) {
      data.items.forEach(it => {
        const itemBase = (it.qty || 0) * (it.rate || 0) * (it.packing || 1);
        baseAmount += itemBase;
        const gst = it.gstRate || 0;
        totalTax += (itemBase * gst) / 100;
      });
    }

    const isIntraState = (data.partyGstin || '').startsWith('09');
    const cgst = isIntraState ? totalTax / 2 : 0;
    const sgst = isIntraState ? totalTax / 2 : 0;
    const igst = !isIntraState ? totalTax : 0;
    const rawTotal = baseAmount + cgst + sgst + igst;
    const nettTotal = Math.round(rawTotal);
    const roundOff = nettTotal - rawTotal;

    const movement = await StockMovement.create({
      docNo,
      direction: data.direction,
      type: data.type,
      billingMode: data.billingMode || 'regular',
      date: data.date || new Date(),
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      partyType: data.partyType || '',
      partyId: data.partyId,
      partyName: data.partyName || '',
      partyGstin: data.partyGstin || '',
      partyAddress: data.partyAddress || '',
      items: data.items || [],
      baseAmount,
      cgst, sgst, igst, roundOff,
      totalAmount: data.totalAmount ?? nettTotal,
      isFree: data.isFree || false,
      status: data.status || 'draft',
      notes: data.notes || '',
      medicalRepName: data.medicalRepName || '',
      doctorName: data.doctorName || '',
      damageReason: data.damageReason || '',
      transporter: data.transporter || '',
      lrNo: data.lrNo || '',
      vehicleNo: data.vehicleNo || '',
      courierName: data.courierName || '',
      trackingId: data.trackingId || '',
      totalBoxes: data.totalBoxes || '1',
      createdBy: req.user?.name || 'System',
      sourceDocType: data.sourceDocType || '',
      sourceDocId: data.sourceDocId,
    });

    await syncOrderLogistics(movement);

    // Auto-dispatch: if direction is 'out', immediately deduct inventory
    if (movement.direction === 'out' && movement.status === 'dispatched') {
      await deductInventory(movement);
      await syncCustomerLedger(movement, req.user?.name);
    }

    // Auto-receive: if direction is 'in', immediately increase inventory
    if (movement.direction === 'in' && movement.status === 'received') {
      await increaseInventory(movement);
    }

    if (req.io) {
      req.io.emit('challan_updated', movement);
      req.io.emit('inventory_updated', { type: 'challan', movementId: movement._id });
    }

    res.status(201).json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update (draft only)
router.put('/:id', authorize('stockmovement:edit'), validate(schemas.stockMovementSchema.partial()), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.status !== 'draft') return res.status(400).json({ error: 'Can only edit draft movements' });

    const data = req.body;
    Object.assign(movement, data);
    movement.createdBy = req.user?.name || movement.createdBy;
    await movement.save();
    await syncOrderLogistics(movement);
    if (req.io) {
      req.io.emit('challan_updated', movement);
    }
    res.json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dispatch (change status from draft to dispatched for outbound)
router.patch('/:id/dispatch', authorize('stockmovement:edit'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.status !== 'draft') return res.status(400).json({ error: 'Movement is not in draft status' });
    if (movement.direction !== 'out') return res.status(400).json({ error: 'Only outbound movements can be dispatched' });

    movement.status = 'dispatched';
    await movement.save();
    await deductInventory(movement);
    await syncCustomerLedger(movement, req.user?.name);
    await syncOrderLogistics(movement);

    if (req.io) {
      req.io.emit('challan_updated', movement);
      req.io.emit('inventory_updated', { type: 'dispatch', movementId: movement._id });
    }

    res.json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Receive (for inbound movements)
router.patch('/:id/receive', authorize('stockmovement:edit'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.status !== 'draft') return res.status(400).json({ error: 'Movement is not in draft status' });
    if (movement.direction !== 'in') return res.status(400).json({ error: 'Only inbound movements can be received' });

    movement.status = 'received';
    await movement.save();
    await increaseInventory(movement);

    if (req.io) {
      req.io.emit('challan_updated', movement);
      req.io.emit('inventory_updated', { type: 'receive', movementId: movement._id });
    }

    res.json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel (reverts inventory for dispatched outbound movements)
router.patch('/:id/cancel', authorize('stockmovement:delete'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.convertedToInvoice) return res.status(400).json({ error: 'Cannot cancel a movement that has been converted to invoice' });

    const wasDispatched = movement.status === 'dispatched' || movement.status === 'received';
    movement.status = 'cancelled';
    await movement.save();

    if (wasDispatched && movement.direction === 'out') {
      await revertInventory(movement);
      await revertCustomerLedger(movement);
    }

    if (req.io) {
      req.io.emit('challan_updated', movement);
      req.io.emit('inventory_updated', { type: 'cancel', movementId: movement._id });
    }

    res.json(movement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete (permanent, only if draft/cancelled)
router.delete('/:id', authorize('stockmovement:delete'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.status === 'dispatched' || movement.status === 'received') {
      return res.status(400).json({ error: 'Cannot delete a dispatched/received movement. Cancel it first.' });
    }
    await StockMovement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Stock movement deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Convert to Invoice (for Pakka / GST sales only) ──
router.post('/:id/convert-to-invoice', authorize('stockmovement:edit'), async (req, res) => {
  try {
    const movement = await StockMovement.findById(req.params.id);
    if (!movement) return res.status(404).json({ error: 'Stock movement not found' });
    if (movement.direction !== 'out' || movement.type !== 'sale') {
      return res.status(400).json({ error: 'Only outbound sale movements can be converted to invoice' });
    }
    if (movement.convertedToInvoice) {
      return res.status(400).json({ error: `Already converted to invoice ${movement.invoiceNo}` });
    }
    // Cash sales don't need a tax invoice — the DC is the final document
    if (movement.billingMode === 'cash') {
      return res.status(400).json({ error: 'Cash sales do not generate a tax invoice. The Delivery Challan is the final document.' });
    }
    if (!movement.partyGstin || !movement.partyGstin.trim()) {
      return res.status(400).json({ error: 'Party does not have a GSTIN. Cannot create a GST (Regular) invoice.' });
    }

    const Invoice = require('../../models/Invoice');
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'SB';
    const fy = getFinancialYearString();
    const prefix = `${pfx}/${fy}/`;

    const lastInvoice = await Invoice.findOne({
      type: 'sale',
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split('/');
      if (parts.length === 3) nextNum = parseInt(parts[2], 10) + 1;
    }
    const invoiceNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;

    const isIntraState = (movement.partyGstin || '').startsWith('09');
    let totalBase = 0;
    let totalTax = 0;
    const invoiceItems = movement.items.map(it => {
      const itemBase = (it.qty || 0) * (it.rate || 0) * (it.packing || 1);
      totalBase += itemBase;
      const gst = it.gstRate || 0;
      totalTax += (itemBase * gst) / 100;
      return {
        productId: it.productId,
        name: it.productName,
        qty: it.qty,
        boxes: it.qty,
        packing: it.packing || 1,
        rate: it.rate || 0,
        gstRate: it.gstRate || 0,
        batchNo: it.batchNo || '',
        hsnCode: it.hsnCode || '',
        mrp: it.mrp || 0,
        discountPercent: it.discountPercent || 0,
      };
    });

    const cgst = isIntraState ? totalTax / 2 : 0;
    const sgst = isIntraState ? totalTax / 2 : 0;
    const igst = !isIntraState ? totalTax : 0;
    const rawTotal = totalBase + cgst + sgst + igst;
    const nettTotal = Math.round(rawTotal);
    const roundOff = nettTotal - rawTotal;

    // Parse Billing and Shipping addresses from the concatenated partyAddress string
    let billingAddress = movement.partyAddress || '';
    let shippingAddress = movement.partyAddress || '';
    if (movement.partyAddress && movement.partyAddress.includes('Billing Address:') && movement.partyAddress.includes('Shipping Address:')) {
      const parts = movement.partyAddress.split('Shipping Address:');
      const billingPart = parts[0].replace('Billing Address:', '').trim();
      const shippingPart = parts[1] ? parts[1].trim() : '';
      if (billingPart) billingAddress = billingPart;
      if (shippingPart) shippingAddress = shippingPart;
    }

    // Create draft tax invoice — inventory already deducted when DC was dispatched
    const invoice = await Invoice.create({
      invoiceNo,
      customerName: movement.partyName,
      partyAddress: billingAddress,
      shippingAddress: shippingAddress,
      date: movement.date || new Date(),
      amount: nettTotal,
      status: 'draft',          // created in draft mode
      mode: 'regular',
      baseAmount: totalBase,
      cgst, sgst, igst, roundOff,
      stateOfSupply: isIntraState ? 'Uttar Pradesh' : 'Other State',
      gstin: movement.partyGstin,
      warehouseId: movement.warehouseId,
      warehouseName: movement.warehouseName,
      deductInventory: false,   // already deducted with DC
      isFinalized: false,       // draft mode
      type: 'sale',
      items: invoiceItems,
      // Link back to source DC
      reference: movement._id ? movement._id.toString() : '',
      sourceDocType: 'StockMovement',
      sourceDocId: movement._id,
    });

    // Note: customer regularBalance was already updated when DC was dispatched.
    // The invoice is now the GST record for GSTR-1.

    // Link movement to invoice
    movement.convertedToInvoice = true;
    movement.invoiceId = invoice._id;
    movement.invoiceNo = invoiceNo;
    await movement.save();

    res.status(201).json({ message: 'Converted to GST invoice', invoice, movement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
