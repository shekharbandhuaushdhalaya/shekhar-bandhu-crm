const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const InventoryEntry = require('../../models/InventoryEntry');
const Challan = require('../../models/Challan');
const Invoice = require('../../models/Invoice');
const Dispatch = require('../../models/Dispatch');

const router = express.Router();

// GET /api/trace/:batchNo — End-to-end batch traceability
router.get('/:batchNo', async (req, res) => {
  try {
    const batchNo = req.params.batchNo.trim().toUpperCase();
    if (!batchNo) return res.status(400).json({ error: 'Batch number is required' });

    const result = {
      batchNo,
      rawMaterialEntries: [],
      productionBatches: [],
      finishedGoodsEntries: [],
      challans: [],
      invoices: [],
      dispatches: [],
    };

    // 1. Search RawMaterialEntry (inward raw material batches)
    const rawEntries = await RawMaterialEntry.find({ batchNo })
      .populate('rawMaterialId', 'name sku unit')
      .lean();
    result.rawMaterialEntries = rawEntries.map(e => ({
      _id: e._id,
      materialName: e.rawMaterialId ? e.rawMaterialId.name : 'Unknown',
      materialSku: e.rawMaterialId ? e.rawMaterialId.sku : '',
      unit: e.rawMaterialId ? e.rawMaterialId.unit : '',
      qty: e.qty,
      purchaseRate: e.purchaseRate,
      vendorName: e.vendorName,
      expiryDate: e.expiryDate,
      createdAt: e.createdAt,
    }));

    // 2. Search BatchProduction (as a raw material batch consumed in production)
    const prodBatchesAsConsumer = await BatchProduction.find({
      'ingredientsConsumed.batchNo': batchNo
    })
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .lean();
    for (const b of prodBatchesAsConsumer) {
      const relevant = b.ingredientsConsumed.filter(ing => ing.batchNo === batchNo);
      result.productionBatches.push({
        relation: 'raw_material_consumed_in',
        batchProductionId: b._id,
        batchNo: b.batchNo,
        productName: b.productId ? b.productId.name : 'Unknown',
        productSku: b.productId ? b.productId.sku : '',
        status: b.status,
        plannedQty: b.plannedQty,
        actualYieldQty: b.actualYieldQty || 0,
        qtyConsumed: relevant.reduce((s, i) => s + (i.qtyConsumed || 0), 0),
        startDate: b.startDate,
        endDate: b.endDate,
      });
    }

    // 3. Search BatchProduction (as a finished goods batch)
    const prodBatchesAsFinished = await BatchProduction.find({ batchNo })
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit')
      .lean();
    for (const b of prodBatchesAsFinished) {
      const ingredientsWithVendor = [];
      if (b.ingredientsConsumed && b.ingredientsConsumed.length > 0) {
        for (const ing of b.ingredientsConsumed) {
          let vendorName = ing.vendorName || '';
          if (!vendorName && ing.batchNo) {
            const rmEntry = await RawMaterialEntry.findOne({ batchNo: ing.batchNo }).lean();
            if (rmEntry) {
              vendorName = rmEntry.vendorName;
            }
          }
          ingredientsWithVendor.push({
            materialName: ing.rawMaterialId ? ing.rawMaterialId.name : (ing.name || 'Unknown Material'),
            batchNo: ing.batchNo,
            qtyConsumed: ing.qtyConsumed,
            unit: ing.rawMaterialId ? ing.rawMaterialId.unit : 'units',
            vendorName: vendorName || 'Direct/Unknown',
          });
        }
      }

      result.productionBatches.push({
        relation: 'finished_batch',
        batchProductionId: b._id,
        batchNo: b.batchNo,
        productName: b.productId ? b.productId.name : 'Unknown',
        productSku: b.productId ? b.productId.sku : '',
        status: b.status,
        plannedQty: b.plannedQty,
        actualYieldQty: b.actualYieldQty || 0,
        wasteQty: b.wasteQty || 0,
        wasteReason: b.wasteReason || '',
        variancePercent: b.variancePercent || 0,
        rawMaterialCost: b.rawMaterialCost || 0,
        unitProductionCost: b.unitProductionCost || 0,
        startDate: b.startDate,
        endDate: b.endDate,
        stages: b.stages || [],
        ingredientsConsumed: ingredientsWithVendor,
      });
    }

    // 4. Search InventoryEntry (finished goods stock with this batch)
    const invEntries = await InventoryEntry.find({ batchNo })
      .populate('productId', 'name sku')
      .lean();
    result.finishedGoodsEntries = invEntries.map(e => ({
      _id: e._id,
      productName: e.productId ? e.productId.name : 'Unknown',
      productSku: e.productId ? e.productId.sku : '',
      warehouseName: e.warehouseName,
      qtyBoxes: e.qtyBoxes,
      packing: e.packing,
      vendorName: e.vendorName,
      mfgDate: e.mfgDate,
      expiryDate: e.expiryDate,
    }));

    // 5. Search Challans (items with this batchNo)
    const challans = await Challan.find({
      items: { $elemMatch: { batchNo } }
    }).lean();
    result.challans = challans.map(c => ({
      _id: c._id,
      challanNo: c.challanNo,
      partyName: c.partyName,
      status: c.status,
      date: c.date,
      items: c.items.filter(i => i.batchNo === batchNo).map(i => ({
        name: i.name,
        qty: i.qty,
        packing: i.packing,
      })),
    }));

    // 6. Search Invoices (items with this batchNo)
    const invoices = await Invoice.find({
      items: { $elemMatch: { batchNo } }
    }).lean();
    result.invoices = invoices.map(inv => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      customerName: inv.customerName || inv.supplierName,
      status: inv.status,
      type: inv.type,
      date: inv.date,
      amount: inv.amount,
      paymentTransactionId: inv.paymentTransactionId || '',
      items: inv.items.filter(i => i.batchNo === batchNo).map(i => ({
        name: i.name,
        qty: i.qty,
        packing: i.packing,
      })),
    }));

    // 7. Search Dispatches (items with this batchNo)
    const dispatches = await Dispatch.find({
      items: { $elemMatch: { batchNo } }
    }).lean();
    result.dispatches = dispatches.map(d => ({
      _id: d._id,
      dispatchNo: d.dispatchNo,
      customerName: d.customerName,
      status: d.status,
      dispatchDate: d.dispatchDate,
      transporter: d.transporter,
      lrNo: d.lrNo,
      trackingId: d.trackingId,
      items: d.items.filter(i => i.batchNo === batchNo).map(i => ({
        name: i.name,
        qty: i.qty,
        packing: i.packing,
      })),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
