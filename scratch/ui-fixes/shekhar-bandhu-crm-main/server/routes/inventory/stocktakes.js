const express = require('express');
const Stocktake = require('../../models/Stocktake');
const InventoryEntry = require('../../models/InventoryEntry');
const Product = require('../../models/Product');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { withTransaction } = require('../../utils/withTransaction');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const idempotency = require('../../middleware/requiredIdempotency');

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
    const stocktakeNo = await generateAtomicDocumentNumber(`stocktakeNo_${fy}`, `STK/${fy}/`, 5);

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

// PATCH /api/stocktakes/:id/complete — Complete stocktake atomically.
// The count can only post if stock has not moved since the expected quantity snapshot;
// otherwise the operator must refresh/recount instead of overwriting newer movements.
router.patch('/:id/complete', idempotency, authorize('inventory:edit'), async (req, res) => {
  try {
    const completed = await withTransaction(async session => {
      const stocktake = await Stocktake.findById(req.params.id).session(session);
      if (!stocktake) throw Object.assign(new Error('Stocktake run not found'), { status: 404, code: 'STOCKTAKE_NOT_FOUND' });
      if (stocktake.status === 'completed') throw Object.assign(new Error('Stocktake is already completed'), { status: 409, code: 'STOCKTAKE_ALREADY_COMPLETED' });

      for (let idx = 0; idx < (stocktake.items || []).length; idx += 1) {
        const item = stocktake.items[idx];
        const expectedQty = Number(item.expectedQty || 0);
        const countedQty = Number(item.countedQty || 0);
        const varianceQty = countedQty - expectedQty;
        if (countedQty < 0) throw Object.assign(new Error(`Counted quantity cannot be negative for ${item.productName || 'item'}`), { status: 400, code: 'INVALID_COUNT' });
        if (Math.abs(varianceQty) < 0.0001) continue;

        const entryQuery = { warehouseId: stocktake.warehouseId, productId: item.productId };
        if (item.batchNo) entryQuery.batchNo = item.batchNo;
        const matches = await InventoryEntry.find(entryQuery).session(session);
        if (matches.length > 1) throw Object.assign(new Error(`Multiple inventory slots match ${item.productName || 'item'}${item.batchNo ? ` batch ${item.batchNo}` : ''}; stocktake requires an exact slot.`), { status: 409, code: 'STOCKTAKE_SLOT_AMBIGUOUS' });
        let entry = matches[0] || null;
        const currentQty = Number(entry?.qtyBoxes || 0);
        if (Math.abs(currentQty - expectedQty) > 0.0001) throw Object.assign(new Error(`Stock changed after the count started for ${item.productName || 'item'}. Expected ${expectedQty}, current ${currentQty}; refresh and recount.`), { status: 409, code: 'STOCKTAKE_CONCURRENT_MOVEMENT' });

        const product = await Product.findById(item.productId).session(session);
        if (!product) throw Object.assign(new Error(`Product not found: ${item.productName || item.productId}`), { status: 404, code: 'PRODUCT_NOT_FOUND' });
        const nextAggregate = Number(product.stockLevel || 0) + varianceQty;
        if (nextAggregate < -0.0001) throw Object.assign(new Error(`Aggregate stock would become negative for ${item.productName || product.name}`), { status: 409, code: 'AGGREGATE_STOCK_MISMATCH' });

        if (!entry) {
          entry = new InventoryEntry({
            warehouseId: stocktake.warehouseId, warehouseName: stocktake.warehouseName,
            productId: product._id, productType: product.productType || '', size: product.size || '',
            colour: product.colour || '', shape: product.shape || '', weight: product.weight || '',
            hsnCode: product.hsnCode || '', vendorId: '', vendorName: '', packing: 1,
            batchNo: item.batchNo || '', qcStatus: 'approved', qtyBoxes: 0,
          });
        }
        entry.qtyBoxes = countedQty;
        await entry.save({ session });
        product.stockLevel = Math.max(0, nextAggregate);
        await product.save({ session });

        await StockLedger.create([{
          productId: item.productId, warehouseId: stocktake.warehouseId, warehouseName: stocktake.warehouseName,
          type: varianceQty > 0 ? 'IN' : 'OUT', qtyBoxes: varianceQty, balanceBoxes: countedQty,
          reference: stocktake.stocktakeNo, movementKey: `stocktake:${stocktake._id}:${idx}`,
          note: `Cycle count variance adjustment (${varianceQty > 0 ? '+' : ''}${varianceQty} boxes)`,
          createdBy: req.user ? req.user.name : 'Stock Counter', batchNo: item.batchNo || '',
        }], { session });
      }

      stocktake.status = 'completed';
      stocktake.completedAt = new Date();
      await stocktake.save({ session });
      return stocktake;
    });
    if (req.io) req.io.emit('inventory_updated', { type: 'stocktake_completed', stocktakeId: completed._id });
    res.json({ message: `Stocktake ${completed.stocktakeNo} completed and inventory levels adjusted successfully`, stocktake: completed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'STOCKTAKE_COMPLETE_FAILED' });
  }
});

module.exports = router;
