const express = require('express');
const PurchaseOrder = require('../../models/PurchaseOrder');
const GoodsReceivedNote = require('../../models/GoodsReceivedNote');
const Vendor = require('../../models/Vendor');
const Warehouse = require('../../models/Warehouse');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/purchase-orders — List all POs with search and status filter
router.get('/', authorize('vendor:view'), async (req, res) => {
  try {
    const { search, status, vendorId } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { poNo: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } }
      ];
    }
    if (status && status !== 'all') filter.status = status;
    if (vendorId) filter.vendorId = vendorId;

    const pos = await PurchaseOrder.find(filter).sort({ orderDate: -1, createdAt: -1 }).lean();
    res.json(pos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/purchase-orders — Create a new Purchase Order
router.post('/', authorize('vendor:create'), validate(schemas.purchaseOrderSchema), async (req, res) => {
  try {
    const { vendorId, vendorName, items, notes } = req.body;

    const vend = await Vendor.findById(vendorId);
    const resolvedVendorName = vendorName || (vend ? (vend.company || vend.name) : 'Vendor');

    const count = await PurchaseOrder.countDocuments();
    const poNo = `PO-${(count + 1).toString().padStart(4, '0')}`;

    let subtotal = 0;
    let taxAmount = 0;

    const processedItems = items.map(it => {
      const lineBase = it.qtyOrdered * it.unitPrice;
      const lineTax = (lineBase * (it.gstRate || 0)) / 100;
      subtotal += lineBase;
      taxAmount += lineTax;
      return {
        ...it,
        qtyReceived: 0
      };
    });

    const totalAmount = Math.round(subtotal + taxAmount);

    const po = await PurchaseOrder.create({
      poNo,
      vendorId,
      vendorName: resolvedVendorName,
      orderDate: new Date(),
      items: processedItems,
      subtotal: Number(subtotal.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      totalAmount,
      status: 'approved',
      notes,
      createdBy: req.user ? req.user.name : 'System'
    });

    if (req.io) {
      req.io.emit('po_updated', { type: 'created', id: po._id });
    }
    res.status(201).json(po);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/purchase-orders/:id/grn — Create Goods Received Note & Inward Stock into Warehouse
router.post('/:id/grn', authorize('vendor:edit'), validate(schemas.grnSchema), async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    const { warehouseId, items, notes } = req.body;

    const wh = await Warehouse.findById(warehouseId);
    if (!wh) return res.status(404).json({ error: 'Warehouse not found' });

    const grnCount = await GoodsReceivedNote.countDocuments();
    const grnNo = `GRN-${(grnCount + 1).toString().padStart(4, '0')}`;

    const grnItems = [];

    for (const item of items) {
      const { rawMaterialId, productId, name, qtyReceived, qtyAccepted, qtyRejected = 0, batchNo, mfgDate, expiryDate, rejectionReason } = item;

      grnItems.push({
        rawMaterialId,
        productId,
        name,
        qtyReceived,
        qtyAccepted,
        qtyRejected,
        batchNo,
        mfgDate: mfgDate ? new Date(mfgDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        rejectionReason
      });

      // Update PO item qtyReceived
      const poItem = po.items.find(i => i.name.toLowerCase() === name.toLowerCase() || (rawMaterialId && i.rawMaterialId?.toString() === rawMaterialId.toString()));
      if (poItem) {
        poItem.qtyReceived = (poItem.qtyReceived || 0) + qtyAccepted;
      }

      // Inward accepted qty to Inventory/RawMaterialEntry
      if (qtyAccepted > 0) {
        if (rawMaterialId) {
          const rm = await RawMaterial.findById(rawMaterialId);
          if (rm) {
            let rmEntry = await RawMaterialEntry.findOne({ rawMaterialId, batchNo, warehouseId: wh._id });
            if (rmEntry) {
              rmEntry.qty += qtyAccepted;
              await rmEntry.save();
            } else {
              await RawMaterialEntry.create({
                rawMaterialId,
                batchNo,
                initialQty: qtyAccepted,
                qty: qtyAccepted,
                purchaseRate: poItem ? poItem.unitPrice : 0,
                vendorId: po.vendorId,
                vendorName: po.vendorName,
                purchaseRef: grnNo,
                warehouseId: wh._id,
                warehouseName: wh.name,
                mfgDate: mfgDate ? new Date(mfgDate) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null
              });
            }
            rm.stockLevel = (rm.stockLevel || 0) + qtyAccepted;
            await rm.save();
          }
        } else if (productId) {
          const prod = await Product.findById(productId);
          if (prod) {
            prod.stockLevel = (prod.stockLevel || 0) + qtyAccepted;
            await prod.save();
          }
        }
      }
    }

    // Check if PO completed or partially received
    const allCompleted = po.items.every(i => (i.qtyReceived || 0) >= i.qtyOrdered);
    po.status = allCompleted ? 'completed' : 'partially_received';
    await po.save();

    const grn = await GoodsReceivedNote.create({
      grnNo,
      poId: po._id,
      poNo: po.poNo,
      vendorId: po.vendorId,
      vendorName: po.vendorName,
      warehouseId: wh._id,
      receivedDate: new Date(),
      items: grnItems,
      status: 'verified',
      notes,
      receivedBy: req.user ? req.user.name : 'System'
    });

    if (req.io) {
      req.io.emit('grn_updated', { type: 'created', id: grn._id });
    }

    res.status(201).json({ message: 'GRN processed and stock inwarded', grn, po });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/purchase-orders/3-way-match — Perform PO vs GRN vs Purchase Invoice 3-Way Match Verification
router.post('/3-way-match', authorize('vendor:view'), async (req, res) => {
  try {
    const { poId, purchaseInvoiceId } = req.body;
    if (!poId || !purchaseInvoiceId) {
      return res.status(400).json({ error: 'poId and purchaseInvoiceId are required' });
    }

    const [po, grns, invoice] = await Promise.all([
      PurchaseOrder.findById(poId).lean(),
      GoodsReceivedNote.find({ poId }).lean(),
      Invoice.findOne({ _id: purchaseInvoiceId, type: 'purchase' }).lean()
    ]);

    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    if (!invoice) return res.status(404).json({ error: 'Purchase Invoice not found' });

    const totalQtyOrdered = po.items.reduce((s, i) => s + i.qtyOrdered, 0);
    const totalQtyReceived = grns.reduce((s, g) => s + g.items.reduce((is, item) => is + item.qtyAccepted, 0), 0);
    const totalQtyBilled = invoice.items.reduce((s, i) => s + (i.qty || i.boxes || 0), 0);

    const poAmount = po.totalAmount;
    const invoiceAmount = invoice.amount;

    const qtyMatch = totalQtyReceived >= totalQtyOrdered && totalQtyBilled === totalQtyReceived;
    const amountMatch = Math.abs(poAmount - invoiceAmount) <= 10; // 10 rs roundoff margin

    const isMatchSuccessful = qtyMatch && amountMatch;

    res.json({
      matchStatus: isMatchSuccessful ? 'MATCHED' : 'DISCREPANCY_FOUND',
      poNo: po.poNo,
      invoiceNo: invoice.invoiceNo,
      poAmount,
      invoiceAmount,
      totalQtyOrdered,
      totalQtyReceived,
      totalQtyBilled,
      qtyMatch,
      amountMatch,
      discrepancyReason: !isMatchSuccessful ? (
        !qtyMatch ? `Quantity Discrepancy: Received ${totalQtyReceived}, Billed ${totalQtyBilled}, Ordered ${totalQtyOrdered}` :
        `Price Discrepancy: PO Total ₹${poAmount} vs Invoice Total ₹${invoiceAmount}`
      ) : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
