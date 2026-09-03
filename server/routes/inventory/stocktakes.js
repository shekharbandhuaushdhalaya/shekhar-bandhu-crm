const express = require('express');
const Stocktake = require('../../models/Stocktake');
const InventoryEntry = require('../../models/InventoryEntry');
const Product = require('../../models/Product');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/stocktakes — List stocktakes
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { warehouseId, status } = req.query;
    const filter = {};
    if (warehouseId) filter.warehouseId = warehouseId;
    if (status) filter.status = status;
    const list = await Stocktake.find(filter).sort({ date: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stocktakes — Initiate cycle count / stocktake
router.post('/', authorize('inventory:create'), async (req, res) => {
  try {
    const { warehouseId, warehouseName, items, notes } = req.body;
    if (!warehouseId || !warehouseName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'warehouseId, warehouseName, and items array are required' });
    }

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const stocktakeNo = `STK/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;

    let totalVarianceBoxes = 0;
    const processedItems = items.map(it => {
      const expectedQty = Number(it.expectedQty || 0);
      const countedQty = Number(it.countedQty || 0);
      const varianceQty = countedQty - expectedQty;
      totalVarianceBoxes += varianceQty;
      return {
        productId: it.productId,
        productName: it.productName || 'Product',
        batchNo: it.batchNo || '',
        expectedQty,
        countedQty,
        varianceQty,
        notes: it.notes || ''
      };
    });

    const stocktake = await Stocktake.create({
      stocktakeNo,
      warehouseId,
      warehouseName,
      date: new Date(),
      items: processedItems,
      totalVarianceBoxes,
      status: 'draft',
      performedBy: req.user ? req.user.name : 'Stock Counter',
      notes: notes || ''
    });

    res.status(201).json(stocktake);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/stocktakes/:id/complete — Complete stocktake & adjust physical inventory
router.patch('/:id/complete', authorize('inventory:edit'), async (req, res) => {
  try {
    const stocktake = await Stocktake.findById(req.params.id);
    if (!stocktake) return res.status(404).json({ error: 'Stocktake run not found' });

    if (stocktake.status === 'completed') {
      return res.status(400).json({ error: 'Stocktake is already completed' });
    }

    for (const item of stocktake.items) {
      if (item.varianceQty !== 0) {
        // Adjust product stockLevel
        const product = await Product.findById(item.productId);
        if (product) {
          product.stockLevel = Math.max(0, product.stockLevel + item.varianceQty);
          await product.save();
        }

        // Adjust InventoryEntry if present
        const entryQuery = { warehouseId: stocktake.warehouseId, productId: item.productId };
        if (item.batchNo) entryQuery.batchNo = item.batchNo;
        let entry = await InventoryEntry.findOne(entryQuery);
        if (entry) {
          entry.qtyBoxes = Math.max(0, entry.qtyBoxes + item.varianceQty);
          await entry.save();
        }

        // Write StockLedger adjustment entry
        await StockLedger.create({
          productId: item.productId,
          warehouseId: stocktake.warehouseId,
          warehouseName: stocktake.warehouseName,
          type: item.varianceQty > 0 ? 'IN' : 'OUT',
          qtyBoxes: item.varianceQty,
          balanceBoxes: entry ? entry.qtyBoxes : Math.max(0, item.countedQty),
          reference: stocktake.stocktakeNo,
          note: `Cycle count variance adjustment (${item.varianceQty > 0 ? '+' : ''}${item.varianceQty} boxes)`,
          createdBy: req.user ? req.user.name : 'Stock Counter',
          batchNo: item.batchNo || ''
        });
      }
    }

    stocktake.status = 'completed';
    await stocktake.save();

    res.json({
      message: `Stocktake ${stocktake.stocktakeNo} completed and inventory levels adjusted successfully`,
      stocktake
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
