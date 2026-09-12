const express = require('express');
const { authorize } = require('../../middleware/authorize');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { withTransaction } = require('../../utils/withTransaction');

const router = express.Router();

// GET /api/inventory-entries?warehouseId=&search=
// Returns all entries, optionally filtered by warehouse
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { warehouseId, search, showZero } = req.query;
    const filter = {};
    if (showZero !== 'true') {
      filter.qtyBoxes = { $gt: 0 };
    } // hide zero-stock entries
    if (warehouseId) filter.warehouseId = warehouseId;
    if (search) {
      filter.$or = [
        { productType: { $regex: search, $options: 'i' } },
        { size: { $regex: search, $options: 'i' } },
        { colour: { $regex: search, $options: 'i' } },
        { shape: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } },
      ];
    }
    const entries = await InventoryEntry.find(filter).sort({ updatedAt: -1 }).lean();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory-entries/consolidated?search=
// Returns one row per (product + vendor + packing) configuration summed across all warehouses
router.get('/consolidated', authorize('inventory:view'), async (req, res) => {
  try {
    const { search, showZero } = req.query;
    const matchStage = {}; // By default include everything, frontend handles the zero filter or we can apply it conditionally
    if (showZero !== 'true') {
      matchStage.qtyBoxes = { $gt: 0 };
    }
    if (search) {
      matchStage.$or = [
        { productType: { $regex: search, $options: 'i' } },
        { size: { $regex: search, $options: 'i' } },
        { colour: { $regex: search, $options: 'i' } },
        { shape: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } },
      ];
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          // Group by product + vendor + packing + batchNo so each batch is tracked separately
          _id: { productId: '$productId', vendorId: '$vendorId', packing: '$packing', batchNo: '$batchNo' },
          productId:   { $first: '$productId' },
          vendorId:    { $first: '$vendorId' },
          packing:     { $first: '$packing' },
          batchNo:     { $first: '$batchNo' },
          mfgDate:     { $first: '$mfgDate' },
          expiryDate:  { $first: '$expiryDate' },
          manufacturingUnitId:   { $first: '$manufacturingUnitId' },
          manufacturingUnitName: { $first: '$manufacturingUnitName' },
          productType: { $first: '$productType' },
          size:        { $first: '$size' },
          colour:      { $first: '$colour' },
          shape:       { $first: '$shape' },
          weight:      { $first: '$weight' },
          hsnCode:     { $first: '$hsnCode' },
          vendorName:  { $first: '$vendorName' },
          totalBoxes:  { $sum: '$qtyBoxes' },
          warehouses:  { $push: { warehouseId: '$warehouseId', warehouseName: '$warehouseName', qtyBoxes: '$qtyBoxes' } },
        },
      },
      { $sort: { productType: 1, colour: 1, vendorName: 1, packing: 1 } },
    ];

    // Conditionally exclude groups whose total has dropped to zero
    if (showZero !== 'true') {
      pipeline.splice(pipeline.length - 1, 0, { $match: { totalBoxes: { $gt: 0 } } });
    }

    const consolidated = await InventoryEntry.aggregate(pipeline);
    res.json(consolidated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory-entries — Manual stock receipt. Inventory slot, aggregate stock and ledger post atomically.
router.post('/', authorize('inventory:create'), validate(schemas.inventoryEntrySchema), async (req, res) => {
  try {
    const result = await withTransaction(async (session) => {
      const { warehouseId, productId, note, reference, createdBy, vendorId, vendorName, batchNo, mfgDate, expiryDate } = req.body;
      const qtyBoxes = Number(req.body.qtyBoxes);
      const packing = Number(req.body.packing) || 1;
      const qcStatus = req.body.qcStatus || 'under_test';
      if (!warehouseId || !productId || !(qtyBoxes > 0)) throw Object.assign(new Error('warehouseId, productId and positive qtyBoxes are required'), { code: 'INVALID_STOCK_RECEIPT' });

      const [warehouse, product] = await Promise.all([
        Warehouse.findById(warehouseId).session(session), Product.findById(productId).session(session),
      ]);
      if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { code: 'WAREHOUSE_NOT_FOUND' });
      if (!product) throw Object.assign(new Error('Product not found'), { code: 'PRODUCT_NOT_FOUND' });

      const resolvedVendorId = vendorId || product.vendorId || '';
      const resolvedVendorName = vendorName || product.vendorName || '';
      const resolvedBatchNo = String(batchNo || '').trim();
      let entry = await InventoryEntry.findOne({ warehouseId, productId, vendorId: resolvedVendorId, packing, batchNo: resolvedBatchNo, qcStatus }).session(session);
      if (!entry) entry = new InventoryEntry({
        warehouseId, warehouseName: warehouse.name, productId,
        productType: product.productType || '', size: product.size || '', colour: product.colour || '', shape: product.shape || '', weight: product.weight || '', hsnCode: product.hsnCode || '',
        vendorId: resolvedVendorId, vendorName: resolvedVendorName, qtyBoxes: 0, packing, batchNo: resolvedBatchNo,
        mfgDate: mfgDate ? new Date(mfgDate) : undefined, expiryDate: expiryDate ? new Date(expiryDate) : undefined, qcStatus,
      });
      entry.qtyBoxes = Number(entry.qtyBoxes || 0) + qtyBoxes;
      if (mfgDate) entry.mfgDate = new Date(mfgDate);
      if (expiryDate) entry.expiryDate = new Date(expiryDate);
      await entry.save({ session });
      await Product.updateOne({ _id: productId }, { $inc: { stockLevel: qtyBoxes } }, { session });
      await StockLedger.create([{
        productId, warehouseId, warehouseName: warehouse.name, type: 'IN', qtyBoxes, balanceBoxes: entry.qtyBoxes,
        reference: reference || '', note: note || 'Manual stock receipt', createdBy: createdBy || req.user?.name || '', packing,
        vendorId: resolvedVendorId, vendorName: resolvedVendorName, batchNo: resolvedBatchNo, mfgDate: entry.mfgDate, expiryDate: entry.expiryDate,
        createdAt: req.body.createdAt ? new Date(req.body.createdAt) : undefined,
      }], { session });
      return entry;
    });
    if (req.io) req.io.emit('inventory_updated', { type: 'entry_created', id: result._id, productId: result.productId });
    res.status(201).json(result);
  } catch (err) { res.status(['WAREHOUSE_NOT_FOUND','PRODUCT_NOT_FOUND'].includes(err.code) ? 404 : 400).json({ error: err.message, code: err.code }); }
});

// PUT /api/inventory-entries/:id — Manual adjustment. Slot, aggregate stock and ledger post atomically.
router.put('/:id', authorize('inventory:edit'), validate(schemas.inventoryEntrySchema.partial()), async (req, res) => {
  try {
    const result = await withTransaction(async (session) => {
      const { type, note, reference, createdBy, createdAt } = req.body;
      const entry = await InventoryEntry.findById(req.params.id).session(session);
      if (!entry) throw Object.assign(new Error('Inventory entry not found'), { code: 'INVENTORY_ENTRY_NOT_FOUND' });
      const oldBalance = Number(entry.qtyBoxes || 0);
      const movementType = type || 'ADJUSTMENT';
      const movement = Number(req.body.qtyBoxes);
      if (!Number.isFinite(movement) || movement < 0) throw Object.assign(new Error('qtyBoxes must be a non-negative number'), { code: 'INVALID_QUANTITY' });
      let newBalance;
      if (movementType === 'OUT') {
        if (oldBalance < movement) throw Object.assign(new Error('Insufficient stock'), { code: 'INSUFFICIENT_STOCK' });
        newBalance = oldBalance - movement;
      } else if (movementType === 'IN') newBalance = oldBalance + movement;
      else newBalance = movement;
      const delta = newBalance - oldBalance;
      entry.qtyBoxes = newBalance;
      await entry.save({ session });
      if (delta < 0) {
        const update = await Product.updateOne({ _id: entry.productId, stockLevel: { $gte: -delta } }, { $inc: { stockLevel: delta } }, { session });
        if (!update.modifiedCount) throw Object.assign(new Error('Aggregate product stock is lower than this adjustment. Run inventory reconciliation before retrying.'), { code: 'AGGREGATE_STOCK_MISMATCH' });
      } else if (delta > 0) await Product.updateOne({ _id: entry.productId }, { $inc: { stockLevel: delta } }, { session });
      await StockLedger.create([{
        productId: entry.productId, warehouseId: entry.warehouseId, warehouseName: entry.warehouseName, type: movementType,
        qtyBoxes: delta, balanceBoxes: newBalance, reference: reference || '', note: note || 'Manual stock adjustment',
        createdBy: createdBy || req.user?.name || '', packing: entry.packing, vendorId: entry.vendorId || '', vendorName: entry.vendorName || '', batchNo: entry.batchNo || '',
        createdAt: createdAt ? new Date(createdAt) : undefined,
      }], { session });
      return entry;
    });
    if (req.io) req.io.emit('inventory_updated', { type: 'entry_adjusted', id: result._id });
    res.json(result);
  } catch (err) { res.status(err.code === 'INVENTORY_ENTRY_NOT_FOUND' ? 404 : 400).json({ error: err.message, code: err.code }); }
});

// PATCH /api/inventory-entries/:id — Update metadata fields (e.g. purchaseRate)
router.patch('/:id', authorize('inventory:edit'), async (req, res) => {
  try {
    const allowed = ['purchaseRate', 'batchNo', 'mfgDate', 'expiryDate', 'vendorName', 'hsnCode'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const entry = await InventoryEntry.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!entry) return res.status(404).json({ error: 'Inventory entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/inventory-entries/ledger/:productId — Stock ledger for a product
router.get('/ledger/:productId', authorize('inventory:view'), async (req, res) => {
  try {
    const { warehouseId, packing, vendorId, batchNo, startDate, endDate } = req.query;
    const filter = { productId: req.params.productId };
    if (warehouseId) filter.warehouseId = warehouseId;
    if (packing)     filter.packing  = parseInt(packing);
    if (vendorId)    filter.vendorId  = vendorId;
    if (batchNo !== undefined) filter.batchNo = batchNo; // supports empty string to filter unbatched
    
    if (startDate || endDate) {
      filter.createdAt = {};
      
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) filter.createdAt.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }
      
      // Clean up if both were invalid
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt;
      }
    }
    
    const ledger = await StockLedger.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory-entries/expiry-alerts?days=30
// Returns finished-goods entries nearing expiry
router.get('/expiry-alerts', authorize('inventory:view'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const entries = await InventoryEntry.find({
      qtyBoxes: { $gt: 0 },
      expiryDate: { $exists: true, $ne: null }
    }).sort({ expiryDate: 1 }).lean();

    const alerts = [];
    for (const entry of entries) {
      const exp = new Date(entry.expiryDate);
      const daysToExpiry = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      const status = daysToExpiry < 0 ? 'expired' : daysToExpiry <= days ? 'expiring_soon' : 'ok';
      if (status === 'ok') continue;
      alerts.push({
        _id: entry._id,
        warehouseName: entry.warehouseName,
        productType: entry.productType,
        size: entry.size,
        batchNo: entry.batchNo,
        qtyBoxes: entry.qtyBoxes,
        expiryDate: entry.expiryDate,
        daysToExpiry,
        status
      });
    }

    res.json({
      alerts,
      total: alerts.length,
      expiredCount: alerts.filter(a => a.status === 'expired').length,
      expiringSoonCount: alerts.filter(a => a.status === 'expiring_soon').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
