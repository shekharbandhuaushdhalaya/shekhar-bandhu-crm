const express = require('express');
const BatchProduction = require('../models/BatchProduction');
const BillOfMaterials = require('../models/BillOfMaterials');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');

const router = express.Router();

// GET /api/batch-productions — List all batch production runs
router.get('/', async (req, res) => {
  try {
    const batches = await BatchProduction.find({})
      .populate('productId', 'name sku size packing')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .sort({ createdAt: -1 })
      .lean();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/batch-productions — Start a new batch production run
router.post('/', async (req, res) => {
  try {
    const { productId, plannedQty, batchNo } = req.body;
    if (!productId || !plannedQty || !batchNo) {
      return res.status(400).json({ error: 'Product ID, planned quantity, and batch number are required' });
    }

    const valPlanned = Number(plannedQty);
    if (isNaN(valPlanned) || valPlanned <= 0) {
      return res.status(400).json({ error: 'Planned quantity must be a positive number' });
    }

    // Check if batch number is unique
    const existingBatch = await BatchProduction.findOne({ batchNo: batchNo.trim().toUpperCase() });
    if (existingBatch) {
      return res.status(400).json({ error: `Production batch number ${batchNo} already exists` });
    }

    const prod = await Product.findById(productId);
    if (!prod) return res.status(404).json({ error: 'Finished product not found' });

    // Fetch BOM recipe
    const bom = await BillOfMaterials.findOne({ productId });
    if (!bom) {
      return res.status(400).json({ error: `No Bill of Materials configured for product: ${prod.name}` });
    }

    // 1. Calculate required ingredients quantities
    const ingredientsRequired = bom.ingredients.map(ing => {
      const scale = valPlanned / bom.batchYieldSize;
      const qtyNeeded = ing.qtyRequired * scale;
      return {
        rawMaterialId: ing.rawMaterialId,
        qtyNeeded
      };
    });

    // 2. Validate all ingredients have enough stock in RawMaterialEntry
    const verifiedDeductions = [];
    for (const reqIng of ingredientsRequired) {
      const rm = await RawMaterial.findById(reqIng.rawMaterialId);
      const entries = await RawMaterialEntry.find({ rawMaterialId: reqIng.rawMaterialId });

      // FEFO Sort: Prioritize ingredients closer to expiry. Fallback to creation date (FIFO).
      entries.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        }
        if (a.expiryDate && !b.expiryDate) return -1; // a comes first
        if (!a.expiryDate && b.expiryDate) return 1;  // b comes first
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      const totalAvailable = entries.reduce((acc, e) => acc + (e.qty || 0), 0);
      if (totalAvailable < reqIng.qtyNeeded) {
        return res.status(400).json({
          error: `Insufficient stock for raw material: ${rm.name}. Needed: ${reqIng.qtyNeeded.toFixed(2)} ${rm.unit}, Available: ${totalAvailable.toFixed(2)} ${rm.unit}`
        });
      }

      // Record which entries will be deducted
      let needed = reqIng.qtyNeeded;
      for (const entry of entries) {
        if (needed <= 0) break;
        if ((entry.qty || 0) <= 0) continue;

        const deduct = Math.min(needed, entry.qty);
        verifiedDeductions.push({
          entry,
          deductQty: deduct,
          rawMaterialId: reqIng.rawMaterialId
        });
        needed -= deduct;
      }
    }

    // 3. Deduct stock and commit changes
    const ingredientsConsumed = [];
    let rawMaterialCost = 0;
    for (const dec of verifiedDeductions) {
      const { entry, deductQty, rawMaterialId } = dec;
      entry.qty = Math.max(0, entry.qty - deductQty);
      await entry.save();

      rawMaterialCost += deductQty * (entry.purchaseRate || 0);

      ingredientsConsumed.push({
        rawMaterialId,
        rawMaterialEntryId: entry._id,
        qtyConsumed: deductQty,
        batchNo: entry.batchNo
      });
    }

    // 4. Create active production run
    const newBatch = await BatchProduction.create({
      batchNo: batchNo.trim().toUpperCase(),
      productId,
      plannedQty: valPlanned,
      status: 'in_progress',
      ingredientsConsumed,
      rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
      startDate: new Date()
    });

    res.status(201).json(newBatch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/complete — Complete batch, record QC and inward finished stock
router.patch('/:id/complete', async (req, res) => {
  try {
    const { actualYieldQty, qcNotes, qcPassedBy } = req.body;
    if (actualYieldQty === undefined || !qcPassedBy) {
      return res.status(400).json({ error: 'Actual yield quantity and QC inspector name are required' });
    }

    const valYield = Number(actualYieldQty);
    if (isNaN(valYield) || valYield < 0) {
      return res.status(400).json({ error: 'Actual yield must be a positive number' });
    }

    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed') {
      return res.status(400).json({ error: 'Batch is already completed' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled batch' });
    }

    const prod = await Product.findById(batch.productId);
    if (!prod) return res.status(404).json({ error: 'Product definition not found' });

    // Locate primary warehouse (Varanasi Central Depot)
    const warehouse = await Warehouse.findOne({ name: /varanasi central/i });
    if (!warehouse) {
      return res.status(500).json({ error: 'Primary warehouse not configured. Stock inward failed.' });
    }

    // 1. Create finished goods InventoryEntry
    const packingSize = prod.packing || 1;
    const boxes = Math.ceil(valYield / packingSize);

    // Check if finished inventory entry already exists for this batch
    let finEntry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: prod._id,
      batchNo: batch.batchNo
    });

    if (finEntry) {
      finEntry.qtyBoxes += boxes;
      await finEntry.save();
    } else {
      finEntry = await InventoryEntry.create({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: prod._id,
        productType: prod.productType || '',
        size:        prod.size        || '',
        colour:      prod.colour      || '',
        shape:       prod.shape       || '',
        weight:      prod.weight      || '',
        hsnCode:     prod.hsnCode     || '',
        vendorId:    prod.vendorId    || '',
        vendorName:  prod.vendorName  || '',
        qtyBoxes:    boxes,
        packing:     packingSize,
        batchNo:     batch.batchNo,
        mfgDate:     new Date(),
        expiryDate:  new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000) // 3 years shelf life
      });
    }

    // 2. Add output yield to product stock level
    prod.stockLevel += valYield;
    await prod.save();

    // 3. Record Finished Goods Stock Ledger IN Entry
    await StockLedger.create({
      productId: prod._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: boxes,
      balanceBoxes: finEntry.qtyBoxes,
      reference: `Production Batch ${batch.batchNo}`,
      note: `Inwarded from Batch Production run by QC Inspector ${qcPassedBy}`,
      createdBy: qcPassedBy,
      packing: packingSize,
      batchNo: batch.batchNo
    });

    // 4. Update Batch status to completed
    batch.actualYieldQty = valYield;
    batch.unitProductionCost = valYield > 0 ? Number((batch.rawMaterialCost / valYield).toFixed(2)) : 0;
    batch.qcNotes = qcNotes ? qcNotes.trim() : '';
    batch.qcPassedBy = qcPassedBy.trim();
    batch.status = 'completed';
    batch.endDate = new Date();
    await batch.save();

    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/batch-productions/:id/cancel — Cancel active production run, revert raw materials stock
router.patch('/:id/cancel', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    if (batch.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed batch' });
    }
    if (batch.status === 'cancelled') {
      return res.status(400).json({ error: 'Batch is already cancelled' });
    }

    // Revert raw materials stocks
    for (const item of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(item.rawMaterialEntryId);
      if (entry) {
        entry.qty += item.qtyConsumed;
        await entry.save();
      } else {
        // Fallback: create a new entry for raw material if it was deleted
        await RawMaterialEntry.create({
          rawMaterialId: item.rawMaterialId,
          batchNo: item.batchNo,
          qty: item.qtyConsumed,
          purchaseRate: 0
        });
      }
    }

    batch.status = 'cancelled';
    batch.endDate = new Date();
    await batch.save();

    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/batch-productions/:id/bmr-report — Generate a compliance-friendly Batch Manufacturing Record (BMR)
router.get('/:id/bmr-report', async (req, res) => {
  try {
    const batch = await BatchProduction.findById(req.params.id)
      .populate('productId')
      .populate('ingredientsConsumed.rawMaterialId')
      .lean();

    if (!batch) return res.status(404).json({ error: 'Batch production run not found' });

    // For each consumed ingredient, fetch purchaseRate details from RawMaterialEntry
    const RawMaterialEntry = require('../models/RawMaterialEntry');
    const enrichedIngredients = [];

    for (const ing of batch.ingredientsConsumed) {
      const entry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
      const rate = entry ? (entry.purchaseRate || 0) : 0;
      enrichedIngredients.push({
        name: ing.rawMaterialId ? ing.rawMaterialId.name : 'Unknown Material',
        code: ing.rawMaterialId ? ing.rawMaterialId.code : 'N/A',
        batchNo: ing.batchNo,
        qtyConsumed: ing.qtyConsumed,
        unit: ing.rawMaterialId ? ing.rawMaterialId.unit : 'kg',
        purchaseRate: rate,
        itemCost: Number((ing.qtyConsumed * rate).toFixed(2))
      });
    }

    res.json({
      batchNo: batch.batchNo,
      productName: batch.productId ? batch.productId.name : 'Unknown Product',
      productSku: batch.productId ? batch.productId.sku : 'N/A',
      productPrice: batch.productId ? batch.productId.price : 0,
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || 0,
      status: batch.status,
      startDate: batch.startDate,
      endDate: batch.endDate,
      qcNotes: batch.qcNotes || 'N/A',
      qcPassedBy: batch.qcPassedBy || 'N/A',
      rawMaterialCost: batch.rawMaterialCost || 0,
      unitProductionCost: batch.unitProductionCost || 0,
      ingredients: enrichedIngredients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
