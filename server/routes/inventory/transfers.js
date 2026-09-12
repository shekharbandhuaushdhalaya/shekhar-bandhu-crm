const express = require('express');
const router = express.Router();
const StockTransfer = require('../../models/StockTransfer');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const Product = require('../../models/Product');
const StockLedger = require('../../models/StockLedger');
const Challan = require('../../models/Challan');
const { postChallanInventory, reverseChallanInventory } = require('../../services/challanInventoryService');
const idempotency = require('../../middleware/idempotency');
const { authorize } = require('../../middleware/authorize');

// GET /api/inventory/transfers — List all stock transfers
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const transfers = await StockTransfer.find({}).sort({ createdAt: -1 }).lean();
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/transfers — Create a transfer request
router.post('/', authorize('inventory:create'), async (req, res) => {
  try {
    const { fromWarehouseId, toWarehouseId, items, notes } = req.body;

    if (!fromWarehouseId || !toWarehouseId || !items || items.length === 0) {
      return res.status(400).json({ error: 'fromWarehouseId, toWarehouseId, and items are required' });
    }

    const [fromW, toW] = await Promise.all([
      Warehouse.findById(fromWarehouseId),
      Warehouse.findById(toWarehouseId)
    ]);

    if (!fromW || !toW) {
      return res.status(404).json({ error: 'Source or target warehouse not found' });
    }

    const count = await StockTransfer.countDocuments();
    const transferNo = `TRSF-${(count + 1).toString().padStart(4, '0')}`;

    const enrichedItems = [];
    for (const item of items) {
      const prod = await Product.findById(item.productId);
      enrichedItems.push({
        productId: item.productId,
        productName: prod ? prod.name : 'Unknown Product',
        qtyBoxes: parseFloat(item.qtyBoxes),
        packing: parseInt(item.packing, 10) || 1,
        batchNo: (item.batchNo || '').trim()
      });
    }

    const transfer = await StockTransfer.create({
      transferNo,
      fromWarehouseId,
      fromWarehouseName: fromW.name,
      toWarehouseId,
      toWarehouseName: toW.name,
      items: enrichedItems,
      notes: notes || '',
      createdBy: req.user ? req.user.name : 'System',
      status: 'pending'
    });

    if (req.io) {
      req.io.emit('transfer_updated', { type: 'created', id: transfer._id });
    }
    res.status(201).json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/approve — Approve transfer request
router.patch('/:id/approve', authorize('inventory:edit'), async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

    transfer.approvedBy = req.user ? req.user.name : 'Warehouse Manager';
    transfer.approvedAt = new Date();
    await transfer.save();

    if (req.io) req.io.emit('transfer_updated', { type: 'approved', id: transfer._id });
    res.json({ message: 'Stock transfer request approved', transfer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/reject — Reject transfer request
router.patch('/:id/reject', authorize('inventory:edit'), async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

    transfer.status = 'cancelled';
    transfer.notes = (transfer.notes ? transfer.notes + '\n' : '') + `Rejected: ${rejectionReason || 'No reason provided'}`;
    await transfer.save();

    if (req.io) req.io.emit('transfer_updated', { type: 'rejected', id: transfer._id });
    res.json({ message: 'Stock transfer request rejected', transfer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/ship — create and post the authoritative Transfer Challan
router.patch('/:id/ship', idempotency, authorize('inventory:edit'), async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'pending') return res.status(400).json({ error: `Cannot ship transfer in status: ${transfer.status}`, code: 'TRANSFER_NOT_SHIPPABLE' });

    if (String(transfer.fromWarehouseId) === String(transfer.toWarehouseId)) return res.status(400).json({ error: 'Source and target warehouses must be different', code: 'SAME_WAREHOUSE_TRANSFER' });
    const fromW = await Warehouse.findById(transfer.fromWarehouseId);
    const toW = await Warehouse.findById(transfer.toWarehouseId);
    if (!fromW || !toW) return res.status(404).json({ error: 'Source or target warehouse not found', code: 'WAREHOUSE_NOT_FOUND' });

    const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
    const challanNo = await generateAtomicDocumentNumber('transferChallanNo', 'CH', 5);
    const challan = await Challan.create({
      challanNo,
      date: new Date(),
      challanType: 'transfer',
      warehouseId: fromW._id,
      warehouseName: fromW.name,
      destinationWarehouseId: toW._id,
      destinationWarehouseName: toW.name,
      partyName: toW.name,
      partyAddress: toW.addressLine1 || '',
      partyCity: toW.city || '',
      shippingAddress: [toW.addressLine1, toW.city, toW.state, toW.pincode].filter(Boolean).join(', '),
      items: transfer.items.map(i => ({ productId: i.productId, name: i.productName || 'Product', qty: Number(i.qtyBoxes), packing: Number(i.packing) || 1, batchNo: i.batchNo || '' })),
      status: 'draft', mode: 'regular', deductInventory: true
    });
    const posted = await postChallanInventory(challan, { userId: req.user?.id || null, createdBy: req.user?.name || 'System' });
    transfer.challanId = posted._id;
    transfer.challanNo = posted.challanNo;
    transfer.status = 'in_transit';
    transfer.approvedBy = req.user?.name || 'System';
    await transfer.save();

    if (req.io) {
      req.io.emit('transfer_updated', { type: 'shipped', id: transfer._id, challanId: posted._id });
      req.io.emit('inventory_updated', { type: 'challan_transfer_posted', challanId: posted._id, transferId: transfer._id });
    }
    res.json({ transfer, challan: posted });
  } catch (err) {
    res.status(err.code === 'INSUFFICIENT_STOCK' ? 400 : 500).json({ error: err.message, code: err.code || 'TRANSFER_SHIP_FAILED' });
  }
});

// PATCH /api/inventory/transfers/:id/receive — receipt only changes logistics status;
// physical stock was already moved by the Transfer Challan at shipment/posting.
router.patch('/:id/receive', idempotency, authorize('inventory:edit'), async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status !== 'in_transit') return res.status(400).json({ error: `Cannot receive transfer in status: ${transfer.status}`, code: 'TRANSFER_NOT_IN_TRANSIT' });
    transfer.status = 'completed';
    transfer.approvedBy = req.user?.name || 'System';
    await transfer.save();
    if (req.io) req.io.emit('transfer_updated', { type: 'received', id: transfer._id, challanId: transfer.challanId });
    res.json(transfer);
  } catch (err) { res.status(500).json({ error: err.message, code: 'TRANSFER_RECEIVE_FAILED' }); }
});

// PATCH /api/inventory/transfers/:id/cancel — pending requests cancel directly; posted transfers reverse their Challan
router.patch('/:id/cancel', idempotency, authorize('inventory:edit'), async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_NOT_FOUND' });
    if (transfer.status === 'completed') return res.status(400).json({ error: 'Completed transfers require a controlled Challan reversal process', code: 'TRANSFER_COMPLETED_IMMUTABLE' });
    if (transfer.status === 'cancelled') return res.status(400).json({ error: 'Transfer is already cancelled', code: 'TRANSFER_ALREADY_CANCELLED' });

    if (transfer.status === 'in_transit') {
      if (!transfer.challanId) return res.status(409).json({ error: 'Transfer has no authoritative Challan', code: 'TRANSFER_CHALLAN_REQUIRED' });
      const challan = await Challan.findById(transfer.challanId);
      if (!challan) return res.status(404).json({ error: 'Authoritative Transfer Challan not found', code: 'CHALLAN_NOT_FOUND' });
      await reverseChallanInventory(challan, { userId: req.user?.id || null, createdBy: req.user?.name || 'System' });
    }
    transfer.status = 'cancelled';
    await transfer.save();
    if (req.io) req.io.emit('transfer_updated', { type: 'cancelled', id: transfer._id, challanId: transfer.challanId });
    res.json(transfer);
  } catch (err) { res.status(err.code === 'CHALLAN_ALREADY_REVERSED' ? 400 : 500).json({ error: err.message, code: err.code || 'TRANSFER_CANCEL_FAILED' }); }
});

module.exports = router;
