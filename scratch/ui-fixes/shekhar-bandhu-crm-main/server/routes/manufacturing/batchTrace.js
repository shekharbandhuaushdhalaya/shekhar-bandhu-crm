const express = require('express');
const BatchProduction = require('../../models/BatchProduction');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const RawMaterial = require('../../models/RawMaterial');
const Invoice = require('../../models/Invoice');
const Dispatch = require('../../models/Dispatch');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/manufacturing/batch-trace/:batchNo — Complete Backward & Forward Batch Traceability for Recall Readiness
router.get('/:batchNo', authorize('inventory:view'), async (req, res) => {
  try {
    const rawBatchNo = req.params.batchNo ? req.params.batchNo.trim() : '';
    if (!rawBatchNo) {
      return res.status(400).json({ error: 'Batch number is required' });
    }

    const batchRegex = new RegExp(`^${rawBatchNo.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

    // 1. Locate BatchProduction record
    const batch = await BatchProduction.findOne({ batchNo: { $regex: batchRegex } })
      .populate('productId', 'name sku unit category')
      .lean();

    if (!batch) {
      return res.status(404).json({ error: `Production batch '${rawBatchNo}' not found` });
    }

    // 2. BACKWARD TRACE: Raw Materials Consumed & Vendor Origins
    const rawMaterialsUsed = [];
    if (batch.ingredientsConsumed && batch.ingredientsConsumed.length > 0) {
      for (const ing of batch.ingredientsConsumed) {
        let rmEntry = null;
        let rm = null;

        if (ing.rawMaterialEntryId) {
          rmEntry = await RawMaterialEntry.findById(ing.rawMaterialEntryId).lean();
        }
        if (!rmEntry && ing.batchNo) {
          rmEntry = await RawMaterialEntry.findOne({ batchNo: ing.batchNo }).lean();
        }

        if (ing.rawMaterialId) {
          rm = await RawMaterial.findById(ing.rawMaterialId).lean();
        }

        rawMaterialsUsed.push({
          rawMaterialId: ing.rawMaterialId || (rmEntry ? rmEntry.rawMaterialId : null),
          rawMaterialName: rm ? rm.name : (rmEntry ? rmEntry.rawMaterialName || 'Raw Material' : 'Raw Material'),
          consumedBatchNo: ing.batchNo || (rmEntry ? rmEntry.batchNo : 'UNKNOWN'),
          qtyConsumed: ing.qtyConsumed || 0,
          unit: rm ? rm.unit : 'kg',
          vendorId: rmEntry ? rmEntry.vendorId : null,
          vendorName: rmEntry ? rmEntry.vendorName || 'Direct Purchase / Unassigned' : 'Unassigned',
          receivedDate: rmEntry ? (rmEntry.createdAt || rmEntry.purchaseDate) : null,
          purchaseRef: rmEntry ? rmEntry.purchaseRef || '' : ''
        });
      }
    }

    // 3. FORWARD TRACE: Outgoing Finished-Goods Sales, Invoices & Dispatches
    const dispatchedTo = [];
    const searchRegex = new RegExp(rawBatchNo.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

    // A. Query Sale Invoices containing this batch
    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      'items.batchNo': { $regex: searchRegex }
    }).lean();

    for (const inv of invoices) {
      const matchingItems = (inv.items || []).filter(item => item.batchNo && searchRegex.test(item.batchNo));
      const qtyShipped = matchingItems.reduce((sum, item) => sum + (item.qty || item.boxes || 0), 0);

      dispatchedTo.push({
        documentType: 'Invoice',
        documentId: inv._id,
        documentNo: inv.invoiceNo,
        customerName: inv.customerName || 'Customer',
        qtyDispatched: qtyShipped,
        unit: matchingItems[0]?.unit || 'Pcs',
        dispatchDate: inv.date || inv.createdAt,
        destinationAddress: inv.partyAddress || inv.shippingAddress || ''
      });
    }

    // B. Query Dispatches containing this batch (if not already covered by Invoice)
    const dispatches = await Dispatch.find({
      'items.batchNo': { $regex: searchRegex }
    }).lean();

    for (const disp of dispatches) {
      const existsInInvoices = dispatchedTo.some(d => d.documentNo === disp.dispatchNo || d.documentNo === disp.invoiceNo);
      if (!existsInInvoices) {
        const matchingItems = (disp.items || []).filter(item => item.batchNo && searchRegex.test(item.batchNo));
        const qtyShipped = matchingItems.reduce((sum, item) => sum + (item.qty || item.boxes || 0), 0);

        dispatchedTo.push({
          documentType: 'Dispatch',
          documentId: disp._id,
          documentNo: disp.dispatchNo || disp.invoiceNo || 'DISP-REF',
          customerName: disp.customerName || 'Customer',
          qtyDispatched: qtyShipped,
          unit: matchingItems[0]?.unit || 'Pcs',
          dispatchDate: disp.dispatchDate || disp.createdAt,
          destinationAddress: disp.deliveryAddress || ''
        });
      }
    }

    // C. Query StockLedger for any direct stock movements OUT
    if (dispatchedTo.length === 0) {
      const ledgerOut = await StockLedger.find({
        batchNo: { $regex: searchRegex },
        type: 'OUT'
      }).lean();

      for (const entry of ledgerOut) {
        dispatchedTo.push({
          documentType: 'StockLedger OUT',
          documentId: entry._id,
          documentNo: entry.reference || 'STOCK-OUT',
          customerName: entry.note || 'Outward Movement',
          qtyDispatched: Math.abs(entry.qtyBoxes || 0),
          unit: 'Boxes',
          dispatchDate: entry.createdAt,
          destinationAddress: entry.warehouseName || ''
        });
      }
    }

    res.json({
      batchNo: batch.batchNo,
      productId: batch.productId ? (batch.productId._id || batch.productId) : null,
      productName: batch.productName || (batch.productId ? batch.productId.name : 'Finished Good'),
      manufacturedDate: batch.mfgDate || batch.startDate || batch.createdAt,
      expiryDate: batch.expiryDate,
      status: batch.status,
      plannedQty: batch.plannedQty,
      actualYieldQty: batch.actualYieldQty || batch.actualYield || 0,
      manufacturingUnit: batch.manufacturingUnitName || 'Varanasi Main Plant',
      rawMaterialsUsed,
      dispatchedTo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
