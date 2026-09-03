const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Dispatch = require('../../models/Dispatch');
const InventoryEntry = require('../../models/InventoryEntry');
const Invoice = require('../../models/Invoice');
const StockMovement = require('../../models/StockMovement');
const Order = require('../../models/Order');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

async function syncOrderLogisticsFromDispatch(dispatch) {
  try {
    let orderId = null;

    // 1. If linked to an invoice
    if (dispatch.invoiceId) {
      const invoice = await Invoice.findById(dispatch.invoiceId);
      if (invoice) {
        if (invoice.reference && mongoose.Types.ObjectId.isValid(invoice.reference)) {
          const exists = await Order.findById(invoice.reference);
          if (exists) {
            orderId = invoice.reference;
          } else {
            // Check if reference is a StockMovement (Challan) which in turn references an Order
            const sm = await StockMovement.findById(invoice.reference);
            if (sm && sm.sourceDocType === 'Order') {
              orderId = sm.sourceDocId;
            }
          }
        }
      }
    }

    // 2. If linked to a challan (StockMovement)
    if (!orderId && dispatch.challanId) {
      const sm = await StockMovement.findById(dispatch.challanId);
      if (sm && sm.sourceDocType === 'Order') {
        orderId = sm.sourceDocId;
      }
    }

    if (orderId) {
      const order = await Order.findById(orderId);
      if (order) {
        if (dispatch.courierName) order.courierName = dispatch.courierName;
        if (dispatch.trackingId) order.trackingId = dispatch.trackingId;
        if (dispatch.trackingUrl) order.courierLink = dispatch.trackingUrl;
        
        const oldStatus = order.status;
        let newStatus = order.status;
        if (dispatch.status === 'pending') {
          newStatus = 'processing';
        } else if (['dispatched', 'in_transit', 'out_for_delivery'].includes(dispatch.status)) {
          newStatus = 'shipped';
        } else if (dispatch.status === 'delivered') {
          newStatus = 'delivered';
        } else if (dispatch.status === 'returned') {
          newStatus = 'cancelled';
        }

        if (oldStatus !== newStatus) {
          let alertMsg = '';
          const tracker = order.trackingId || 'N/A';
          const courier = order.courierName || 'Courier Service';

          if (newStatus === 'processing') {
            alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order of ₹${order.totalAmount} has been approved and is now being processed at our Varanasi factory.`;
          } else if (newStatus === 'shipped') {
            alertMsg = `[SMS/WhatsApp/Email Alert sent to ${order.phone} / ${order.email}]: Hello ${order.name}, your order has been dispatched via ${courier}. Tracking ID: ${tracker}. Monitor your delivery live!`;
          } else if (newStatus === 'delivered') {
            alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order has been successfully delivered. Thank you for choosing Shekhar Bandhu Aushadhalaya!`;
          } else if (newStatus === 'cancelled') {
            alertMsg = `[SMS/WhatsApp Alert sent to ${order.phone}]: Hello ${order.name}, your order has been cancelled/returned. Please contact B2B support for details.`;
          }

          if (alertMsg) {
            if (!order.notifications) order.notifications = [];
            order.notifications.push(`${new Date().toISOString()}:: ${alertMsg}`);
          }
          order.status = newStatus;
        }

        await order.save();
      }
    }

    // Sync back to Challan (StockMovement)
    let smId = dispatch.challanId;
    if (!smId && dispatch.invoiceId) {
      const invoice = await Invoice.findById(dispatch.invoiceId);
      if (invoice && invoice.reference && mongoose.Types.ObjectId.isValid(invoice.reference)) {
        const exists = await StockMovement.findById(invoice.reference);
        if (exists) {
          smId = invoice.reference;
        }
      }
    }

    if (smId) {
      const sm = await StockMovement.findById(smId);
      if (sm) {
        sm.transporter = dispatch.transporter || '';
        sm.lrNo = dispatch.lrNo || '';
        sm.vehicleNo = dispatch.vehicleNo || '';
        sm.courierName = dispatch.courierName || '';
        sm.trackingId = dispatch.trackingId || '';
        sm.totalBoxes = String(dispatch.totalBoxes || '1');
        await sm.save();
      }
    }
  } catch (err) {
    console.error('Failed to sync order/challan logistics from dispatch:', err);
  }
}

const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

async function nextDispatchNo() {
  return generateAtomicDocumentNumber('dispatchNo', 'DSP', 3);
}

// GET all dispatches
router.get('/', async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { customerName: new RegExp(search, 'i') },
      { dispatchNo: new RegExp(search, 'i') },
      { invoiceNo: new RegExp(search, 'i') },
      { challanNo: new RegExp(search, 'i') },
      { lrNo: new RegExp(search, 'i') },
      { trackingId: new RegExp(search, 'i') },
    ];
    const dispatches = await Dispatch.find(filter).sort({ createdAt: -1 });
    res.json(dispatches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create dispatch
router.post('/', validate(schemas.dispatchSchema), async (req, res) => {
  try {
    const dispatchNo = await nextDispatchNo();
    const dispatch = await Dispatch.create({ ...req.body, dispatchNo });
    await syncOrderLogisticsFromDispatch(dispatch);
    if (req.io) {
      req.io.emit('dispatch_updated', { type: 'created', id: dispatch._id });
    }
    res.status(201).json(dispatch);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH update status / tracking
router.patch('/:id', validate(schemas.dispatchSchema.partial()), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.status === 'delivered' && !data.deliveredAt) data.deliveredAt = new Date();
    const dispatch = await Dispatch.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    await syncOrderLogisticsFromDispatch(dispatch);
    if (req.io) {
      req.io.emit('dispatch_updated', { type: 'updated', id: dispatch._id });
    }
    res.json(dispatch);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await Dispatch.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET dead stock report — products with no stock movement in 90 days
router.get('/dead-stock', async (req, res) => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    // Get all inventory entries with qtyBoxes > 0
    const entries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } })
      .populate('productId', 'name sku price size')
      .populate('warehouseId', 'name')
      .lean();

    // Find entries where no stock movement happened since cutoff
    const StockLedger = require('../../models/StockLedger');
    const deadStock = [];

    for (const entry of entries) {
      const lastMovement = await StockLedger.findOne({
        productId: entry.productId?._id || entry.productId,
        warehouseId: entry.warehouseId?._id || entry.warehouseId,
      }).sort({ date: -1 }).select('date');

      const lastDate = lastMovement?.date || entry.updatedAt || entry.createdAt;
      if (new Date(lastDate) < cutoff) {
        deadStock.push({
          productId: entry.productId?._id || entry.productId,
          productName: entry.productId?.name || 'Unknown',
          productSku: entry.productId?.sku || '',
          price: entry.productId?.price || 0,
          size: entry.productId?.size || '',
          warehouseId: entry.warehouseId?._id || entry.warehouseId,
          warehouseName: entry.warehouseId?.name || 'Default',
          qtyBoxes: entry.qtyBoxes,
          stockValue: entry.qtyBoxes * (entry.productId?.price || 0),
          lastMovementDate: lastDate,
          daysSinceMovement: Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000),
        });
      }
    }

    deadStock.sort((a, b) => b.daysSinceMovement - a.daysSinceMovement);
    res.json(deadStock);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
