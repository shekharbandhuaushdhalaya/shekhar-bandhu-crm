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
    const searchKey = req.params.batchNo.trim();
    if (!searchKey) return res.status(400).json({ error: 'Batch number or material parameter is required' });

    const batchNo = searchKey;
    const result = {
      batchNo: searchKey,
      rawMaterialEntries: [],
      productionBatches: [],
      finishedGoodsEntries: [],
      challans: [],
      invoices: [],
      dispatches: [],
    };

    // 1. Search RawMaterialEntry (by batchNo or by RawMaterial ID / name / sku)
    const RawMaterial = require('../../models/RawMaterial');
    const safeRegex = searchKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    let rawMaterial = await RawMaterial.findOne({
      $or: [
        { _id: searchKey.length === 24 && /^[0-9a-fA-F]{24}$/.test(searchKey) ? searchKey : null },
        { name: new RegExp(safeRegex, 'i') },
        { sku: new RegExp(safeRegex, 'i') }
      ]
    }).lean();

    let rawEntries = [];
    if (rawMaterial) {
      result.materialName = rawMaterial.name;
      result.materialSku = rawMaterial.sku;
      rawEntries = await RawMaterialEntry.find({ rawMaterialId: rawMaterial._id })
        .populate('rawMaterialId', 'name sku unit category')
        .lean();
    }
    
    if (rawEntries.length === 0) {
      rawEntries = await RawMaterialEntry.find({
        $or: [
          { batchNo: new RegExp(safeRegex, 'i') },
          { vendorName: new RegExp(safeRegex, 'i') }
        ]
      })
        .populate('rawMaterialId', 'name sku unit category')
        .lean();
    }

    result.rawMaterialEntries = rawEntries.map(e => ({
      _id: e._id,
      materialName: e.rawMaterialId ? e.rawMaterialId.name : 'Unknown',
      materialSku: e.rawMaterialId ? e.rawMaterialId.sku : '',
      unit: e.rawMaterialId ? e.rawMaterialId.unit : '',
      category: e.rawMaterialId ? e.rawMaterialId.category : '',
      initialQty: e.initialQty || e.qty,
      qty: e.qty,
      batchNo: e.batchNo,
      purchaseRate: e.purchaseRate,
      purchaseRef: e.purchaseRef,
      vendorName: e.vendorName,
      warehouseName: e.warehouseName,
      expiryDate: e.expiryDate,
      createdAt: e.createdAt,
    }));

    // 2. Search BatchProduction (as a raw material batch consumed in production)
    let prodBatchesAsConsumer = [];
    if (rawMaterial) {
      prodBatchesAsConsumer = await BatchProduction.find({
        $or: [
          { 'ingredientsConsumed.rawMaterialId': rawMaterial._id },
          { 'ingredientsConsumed.batchNo': batchNo }
        ]
      })
        .populate('productId', 'name sku')
        .populate('manufacturingUnitId', 'name code')
        .populate('ingredientsConsumed.rawMaterialId', 'name sku unit category')
        .lean();
    } else {
      prodBatchesAsConsumer = await BatchProduction.find({
        'ingredientsConsumed.batchNo': batchNo
      })
        .populate('productId', 'name sku')
        .populate('manufacturingUnitId', 'name code')
        .populate('ingredientsConsumed.rawMaterialId', 'name sku unit category')
        .lean();
    }

    for (const b of prodBatchesAsConsumer) {
      const relevant = b.ingredientsConsumed.filter(ing => {
        if (rawMaterial) {
          const rmId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id.toString() : ing.rawMaterialId?.toString();
          return rmId === rawMaterial._id.toString() || ing.batchNo === batchNo;
        }
        return ing.batchNo === batchNo;
      });
      let warehouseName = '';
      if (b.manufacturingUnitId && typeof b.manufacturingUnitId === 'object') {
        warehouseName = b.manufacturingUnitId.name || '';
      }
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
        warehouseName: warehouseName || 'Manufacturing Facility',
        startDate: b.startDate,
        endDate: b.endDate,
      });
    }

    // 3. Search BatchProduction (as a finished goods batch)
    const prodBatchesAsFinished = await BatchProduction.find({ batchNo: new RegExp(safeRegex, 'i') })
      .populate('productId', 'name sku')
      .populate('ingredientsConsumed.rawMaterialId', 'name sku unit category')
      .lean();

    for (const b of prodBatchesAsFinished) {
      const ingredientsWithVendor = [];
      if (b.ingredientsConsumed && b.ingredientsConsumed.length > 0) {
        for (const ing of b.ingredientsConsumed) {
          let vendorName = ing.vendorName || '';
          let rmEntry = null;
          if (ing.rawMaterialEntryId) {
            rmEntry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).populate('rawMaterialId', 'name sku unit category').lean();
          } else if (ing.batchNo) {
            rmEntry = await RawMaterialEntry.findOne({ batchNo: ing.batchNo }).populate('rawMaterialId', 'name sku unit category').lean();
          }

          if (rmEntry) {
            vendorName = rmEntry.vendorName || vendorName;
            // Push into rawMaterialEntries so Incoming Stock (IN) tab displays raw material inward details
            if (!result.rawMaterialEntries.some(e => e._id.toString() === rmEntry._id.toString())) {
              result.rawMaterialEntries.push({
                _id: rmEntry._id,
                materialName: rmEntry.rawMaterialId ? rmEntry.rawMaterialId.name : (ing.rawMaterialId ? ing.rawMaterialId.name : 'Raw Material'),
                materialSku: rmEntry.rawMaterialId ? rmEntry.rawMaterialId.sku : (ing.rawMaterialId ? ing.rawMaterialId.sku : ''),
                unit: rmEntry.rawMaterialId ? rmEntry.rawMaterialId.unit : (ing.rawMaterialId ? ing.rawMaterialId.unit : ''),
                category: rmEntry.rawMaterialId ? rmEntry.rawMaterialId.category : (ing.rawMaterialId ? ing.rawMaterialId.category : ''),
                initialQty: rmEntry.initialQty || rmEntry.qty,
                qty: rmEntry.qty,
                batchNo: rmEntry.batchNo || ing.batchNo,
                purchaseRate: rmEntry.purchaseRate,
                purchaseRef: rmEntry.purchaseRef,
                vendorName: rmEntry.vendorName || 'Direct',
                warehouseName: rmEntry.warehouseName || 'Factory Warehouse',
                expiryDate: rmEntry.expiryDate,
                createdAt: rmEntry.createdAt,
              });
            }
          }

          ingredientsWithVendor.push({
            materialName: ing.rawMaterialId ? ing.rawMaterialId.name : (ing.name || 'Unknown Material'),
            batchNo: ing.batchNo,
            qtyConsumed: ing.qtyConsumed,
            unit: ing.rawMaterialId ? ing.rawMaterialId.unit : 'units',
            category: ing.rawMaterialId ? ing.rawMaterialId.category : '',
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
      manufacturingUnitName: e.manufacturingUnitName || '',
      qtyBoxes: e.qtyBoxes,
      packing: e.packing,
      vendorName: e.vendorName,
      mfgDate: e.mfgDate,
      expiryDate: e.expiryDate,
    }));

    // 5. Search Challans (items with this batchNo)
    const StockMovement = require('../../models/StockMovement');
    const challans = await StockMovement.find({
      items: { $elemMatch: { batchNo: { $regex: new RegExp(safeRegex, 'i') } } }
    }).lean();
    result.challans = challans.map(c => ({
      _id: c._id,
      challanNo: c.docNo,
      partyName: c.partyName,
      status: c.status,
      date: c.date,
      items: c.items.filter(i => i.batchNo && new RegExp(safeRegex, 'i').test(i.batchNo)).map(i => ({
        name: i.productName,
        qty: i.qty,
        packing: i.packing,
      })),
    }));

    // 6. Search Invoices (items with this batchNo)
    const invoices = await Invoice.find({
      items: { $elemMatch: { batchNo: { $regex: new RegExp(safeRegex, 'i') } } }
    }).lean();
    result.invoices = invoices.map(inv => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      customerName: inv.customerName || inv.supplierName,
      status: inv.status,
      isFinalized: inv.isFinalized,
      type: inv.type,
      date: inv.date,
      amount: inv.amount,
      paymentTransactionId: inv.paymentTransactionId || '',
      items: inv.items.filter(i => i.batchNo && new RegExp(safeRegex, 'i').test(i.batchNo)).map(i => ({
        name: i.name,
        qty: i.qty,
        packing: i.packing,
      })),
    }));

    // 7. Search Dispatches (items with this batchNo)
    const dispatches = await Dispatch.find({
      items: { $elemMatch: { batchNo: { $regex: new RegExp(safeRegex, 'i') } } }
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
      items: d.items.filter(i => i.batchNo && new RegExp(safeRegex, 'i').test(i.batchNo)).map(i => ({
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
