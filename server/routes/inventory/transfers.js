const express = require('express');
const router = express.Router();
const StockTransfer = require('../../models/StockTransfer');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const Product = require('../../models/Product');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');

// GET /api/inventory/transfers — List all stock transfers
router.get('/', async (req, res) => {
  try {
    const transfers = await StockTransfer.find({}).sort({ createdAt: -1 }).lean();
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/transfers — Create a transfer request
router.post('/', async (req, res) => {
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

    res.status(201).json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/ship — Ship items (moves status to in_transit and deducts from source warehouse)
router.patch('/:id/ship', async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: `Cannot ship transfer in status: ${transfer.status}` });
    }

    // Deduct stock from source warehouse
    for (const item of transfer.items) {
      const entry = await InventoryEntry.findOne({
        warehouseId: transfer.fromWarehouseId,
        productId: item.productId,
        packing: item.packing,
        batchNo: item.batchNo
      });

      if (!entry || entry.qtyBoxes < item.qtyBoxes) {
        return res.status(400).json({
          error: `Insufficient stock for product ${item.productName} in batch ${item.batchNo || 'unbatched'}`
        });
      }

      entry.qtyBoxes = Math.max(0, entry.qtyBoxes - item.qtyBoxes);
      await entry.save();

      // Record OUT in StockLedger for source warehouse
      await StockLedger.create({
        productId: item.productId,
        warehouseId: transfer.fromWarehouseId,
        warehouseName: transfer.fromWarehouseName,
        type: 'OUT',
        qtyBoxes: -item.qtyBoxes,
        balanceBoxes: entry.qtyBoxes,
        reference: transfer.transferNo,
        note: `Transit Transfer OUT to ${transfer.toWarehouseName}`,
        createdBy: req.user ? req.user.name : 'System',
        packing: item.packing,
        batchNo: item.batchNo
      });
    }

    transfer.status = 'in_transit';
    await transfer.save();

    res.json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/receive — Receive items (moves status to completed and adds to target warehouse)
router.patch('/:id/receive', async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (transfer.status !== 'in_transit') {
      return res.status(400).json({ error: `Cannot receive transfer in status: ${transfer.status}` });
    }

    // Add stock to target warehouse
    for (const item of transfer.items) {
      const prod = await Product.findById(item.productId);
      
      let entry = await InventoryEntry.findOne({
        warehouseId: transfer.toWarehouseId,
        productId: item.productId,
        packing: item.packing,
        batchNo: item.batchNo
      });

      if (entry) {
        entry.qtyBoxes += item.qtyBoxes;
      } else {
        entry = new InventoryEntry({
          warehouseId: transfer.toWarehouseId,
          warehouseName: transfer.toWarehouseName,
          productId: item.productId,
          productType: prod ? prod.productType : '',
          size: prod ? prod.size : '',
          colour: prod ? prod.colour : '',
          shape: prod ? prod.shape : '',
          weight: prod ? prod.weight : '',
          hsnCode: prod ? prod.hsnCode : '',
          qtyBoxes: item.qtyBoxes,
          packing: item.packing,
          batchNo: item.batchNo
        });
      }
      await entry.save();

      // Record IN in StockLedger for target warehouse
      await StockLedger.create({
        productId: item.productId,
        warehouseId: transfer.toWarehouseId,
        warehouseName: transfer.toWarehouseName,
        type: 'IN',
        qtyBoxes: item.qtyBoxes,
        balanceBoxes: entry.qtyBoxes,
        reference: transfer.transferNo,
        note: `Transit Transfer IN from ${transfer.fromWarehouseName}`,
        createdBy: req.user ? req.user.name : 'System',
        packing: item.packing,
        batchNo: item.batchNo
      });
    }

    transfer.status = 'completed';
    transfer.approvedBy = req.user ? req.user.name : 'System';
    await transfer.save();

    res.json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/cancel — Cancel transfer request
router.patch('/:id/cancel', async (req, res) => {
  try {
    const transfer = await StockTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
    if (['completed', 'cancelled'].includes(transfer.status)) {
      return res.status(400).json({ error: `Cannot cancel transfer in status: ${transfer.status}` });
    }

    // If it was already in_transit, we must revert/return stock to the source warehouse
    if (transfer.status === 'in_transit') {
      for (const item of transfer.items) {
        let entry = await InventoryEntry.findOne({
          warehouseId: transfer.fromWarehouseId,
          productId: item.productId,
          packing: item.packing,
          batchNo: item.batchNo
        });

        if (entry) {
          entry.qtyBoxes += item.qtyBoxes;
          await entry.save();
        } else {
          const prod = await Product.findById(item.productId);
          entry = await InventoryEntry.create({
            warehouseId: transfer.fromWarehouseId,
            warehouseName: transfer.fromWarehouseName,
            productId: item.productId,
            productType: prod ? prod.productType : '',
            qtyBoxes: item.qtyBoxes,
            packing: item.packing,
            batchNo: item.batchNo
          });
        }

        // Record IN in StockLedger for source warehouse to roll back
        await StockLedger.create({
          productId: item.productId,
          warehouseId: transfer.fromWarehouseId,
          warehouseName: transfer.fromWarehouseName,
          type: 'IN',
          qtyBoxes: item.qtyBoxes,
          balanceBoxes: entry.qtyBoxes,
          reference: transfer.transferNo,
          note: `Reverted: Cancelled Transfer OUT to ${transfer.toWarehouseName}`,
          createdBy: req.user ? req.user.name : 'System',
          packing: item.packing,
          batchNo: item.batchNo
        });
      }
    }

    transfer.status = 'cancelled';
    await transfer.save();

    res.json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
