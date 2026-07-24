const express = require('express');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/inventory-entries?warehouseId=&search=
// Returns all entries, optionally filtered by warehouse
router.get('/', async (req, res) => {
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
router.get('/consolidated', async (req, res) => {
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

// POST /api/inventory-entries — Add/update stock entry (IN movement)
// A unique stock slot is defined by (warehouseId + productId + vendorId + packing).
// Same product from a different vendor always creates a separate row.
router.post('/', validate(schemas.inventoryEntrySchema), async (req, res) => {
  try {
    const { warehouseId, productId, note, reference, createdBy, vendorId, vendorName, batchNo, mfgDate, expiryDate } = req.body;
    const qtyBoxes = parseFloat(req.body.qtyBoxes);
    const packing  = parseInt(req.body.packing) || 0;

    if (!warehouseId || !productId) {
      return res.status(400).json({ error: 'warehouseId and productId are required' });
    }
    if (isNaN(qtyBoxes) || qtyBoxes <= 0) {
      return res.status(400).json({ error: 'qtyBoxes must be a positive number' });
    }

    const [warehouse, product] = await Promise.all([
      Warehouse.findById(warehouseId),
      Product.findById(productId),
    ]);

    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    if (!product)   return res.status(404).json({ error: 'Product not found' });

    // Resolve the vendor for this batch
    const resolvedVendorId   = vendorId   || product.vendorId   || '';
    const resolvedVendorName = vendorName || product.vendorName || '';
    const resolvedBatchNo    = (batchNo || '').trim();

    // Find the slot that matches all five dimensions:
    // warehouseId + productId + vendorId + packing + batchNo
    let entry = await InventoryEntry.findOne({
      warehouseId,
      productId,
      vendorId: resolvedVendorId,
      packing,
      batchNo: resolvedBatchNo,
    });

    if (entry) {
      // Increment
      entry.qtyBoxes += qtyBoxes;
      if (mfgDate) entry.mfgDate = new Date(mfgDate);
      if (expiryDate) entry.expiryDate = new Date(expiryDate);
    } else {
      entry = new InventoryEntry({
        warehouseId,
        warehouseName: warehouse.name,
        productId,
        productType: product.productType || '',
        size:        product.size        || '',
        colour:      product.colour      || '',
        shape:       product.shape       || '',
        weight:      product.weight      || '',
        hsnCode:     product.hsnCode     || '',
        vendorId:    resolvedVendorId,
        vendorName:  resolvedVendorName,
        qtyBoxes,
        packing,
        batchNo:     resolvedBatchNo,
        mfgDate:     mfgDate ? new Date(mfgDate) : undefined,
        expiryDate:  expiryDate ? new Date(expiryDate) : undefined,
      });
    }
    await entry.save();

    // Record stock ledger entry
    await StockLedger.create({
      productId,
      warehouseId,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes,
      balanceBoxes: entry.qtyBoxes,
      reference: reference || '',
      note:      note      || '',
      createdBy: createdBy || '',
      packing,
      vendorId:   resolvedVendorId,
      vendorName: resolvedVendorName,
      batchNo:    resolvedBatchNo,
      mfgDate:    entry.mfgDate,
      expiryDate: entry.expiryDate,
      createdAt: req.body.createdAt ? new Date(req.body.createdAt) : undefined,
    });

    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/inventory-entries/:id — Adjust stock (IN / OUT / ADJUSTMENT)
router.put('/:id', validate(schemas.inventoryEntrySchema.partial()), async (req, res) => {
  try {
    const { type, note, reference, createdBy, createdAt } = req.body;
    const entry = await InventoryEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Inventory entry not found' });

    const oldBalance = entry.qtyBoxes;
    const movementType = type || 'ADJUSTMENT';
    const movement = parseFloat(req.body.qtyBoxes);
    if (isNaN(movement)) return res.status(400).json({ error: 'Invalid qtyBoxes' });

    let qtyChangeForLedger = 0;

    if (movementType === 'OUT') {
      if (entry.qtyBoxes < movement) return res.status(400).json({ error: 'Insufficient stock' });
      entry.qtyBoxes -= movement;
      qtyChangeForLedger = -movement;
    } else if (movementType === 'IN') {
      entry.qtyBoxes += movement;
      qtyChangeForLedger = movement;
    } else {
      // ADJUSTMENT: set absolute value
      entry.qtyBoxes = movement;
      qtyChangeForLedger = movement - oldBalance;
    }

    await entry.save();

    // Record ledger
    await StockLedger.create({
      productId:     entry.productId,
      warehouseId:   entry.warehouseId,
      warehouseName: entry.warehouseName,
      type:          movementType,
      qtyBoxes:      qtyChangeForLedger,
      balanceBoxes:  entry.qtyBoxes,
      reference:     reference || '',
      note:          note      || '',
      createdBy:     createdBy || '',
      packing:       entry.packing,
      vendorId:      entry.vendorId   || '',
      vendorName:    entry.vendorName || '',
      createdAt:     createdAt ? new Date(createdAt) : undefined,
    });

    res.json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/inventory-entries/ledger/:productId — Stock ledger for a product
router.get('/ledger/:productId', async (req, res) => {
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

module.exports = router;
