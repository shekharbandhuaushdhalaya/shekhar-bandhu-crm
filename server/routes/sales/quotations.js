const express = require('express');
const Quotation = require('../../models/Quotation');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const Challan = require('../../models/Challan');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const Warehouse = require('../../models/Warehouse');
const { createSalesOrder, createDraftFulfillment } = require('../../services/salesOrderService');

const router = express.Router();

// GET /api/quotations — List quotations
router.get('/', authorize('quotation:view'), async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { quotationNo: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    const quotations = await Quotation.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(quotations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quotations — Create quotation
router.post('/', authorize('quotation:create'), validate(schemas.quotationSchema), async (req, res) => {
  try {
    const data = {
      ...req.body,
      quotationNo: req.body.quotationNo || await generateAtomicDocumentNumber('quotationNo', 'QT-', 5),
    };
    const quotation = await Quotation.create(data);
    if (req.io) {
      req.io.emit('quotation_updated', { type: 'created', id: quotation._id });
    }
    res.status(201).json(quotation);

    await logAction({
      action: 'CREATE_QUOTATION',
      description: `Created quotation ${quotation.quotationNo} for ${quotation.customerName} — ₹${quotation.amount || 0}`,
      details: { quotationId: quotation._id, quotationNo: quotation.quotationNo, customer: quotation.customerName, amount: quotation.amount },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/quotations/:id — Edit quotation
router.put('/:id', authorize('quotation:edit'), validate(schemas.quotationSchema.partial()), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    if (quotation.isFinalized) {
      return res.status(409).json({ error: 'A finalized quotation is immutable', code: 'QUOTATION_FINALIZED' });
    }
    
    // Keep quotationNo immutable during edits
    const { quotationNo, ...updateData } = req.body;
    Object.assign(quotation, updateData);
    await quotation.save();
    if (req.io) {
      req.io.emit('quotation_updated', { type: 'updated', id: quotation._id });
    }
    res.json(quotation);

    await logAction({
      action: 'UPDATE_QUOTATION',
      description: `Updated quotation ${quotation.quotationNo} for ${quotation.customerName}`,
      details: { quotationId: quotation._id, quotationNo: quotation.quotationNo, changes: Object.keys(updateData) },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/quotations/:id/finalize — lock the commercial offer before conversion.
router.patch('/:id/finalize', authorize('quotation:edit'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    if (quotation.isFinalized) return res.json(quotation);
    if (!quotation.customerId) {
      return res.status(409).json({ error: 'Link a CRM Customer before finalizing the quotation', code: 'CUSTOMER_REQUIRED' });
    }
    if (!quotation.warehouseId) {
      return res.status(409).json({ error: 'Select a source warehouse before finalizing the quotation', code: 'WAREHOUSE_REQUIRED' });
    }
    quotation.isFinalized = true;
    quotation.status = 'approved';
    await quotation.save();
    if (req.io) req.io.emit('quotation_updated', { type: 'finalized', id: quotation._id });
    await logAction({ action: 'FINALIZE_QUOTATION', description: `Finalized quotation ${quotation.quotationNo}`, details: { quotationId: quotation._id }, req });
    res.json(quotation);
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'QUOTATION_FINALIZE_FAILED' });
  }
});

// DELETE /api/quotations/:id — Delete quotation
router.delete('/:id', authorize('quotation:delete'), async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    
    if (req.io) {
      req.io.emit('quotation_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Quotation deleted' });

    await logAction({
      action: 'DELETE_QUOTATION',
      description: `Deleted quotation ${quotation.quotationNo} for ${quotation.customerName}`,
      details: { quotationId: quotation._id, quotationNo: quotation.quotationNo },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quotations/:id/convert-to-challan — create an authoritative draft Sale Challan.
router.post('/:id/convert-to-challan', authorize('quotation:edit', 'order:create', 'challan:create'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    if (quotation.convertedToChallan && quotation.challanId) {
      const existing = await Challan.findById(quotation.challanId).lean();
      if (existing) return res.status(409).json({ error: `Quotation has already been converted to Challan ${existing.challanNo}`, code: 'QUOTATION_ALREADY_CONVERTED' });
    }
    if (!quotation.isFinalized || quotation.status !== 'approved') {
      return res.status(409).json({ error: 'Finalize and approve the quotation before creating its Sales Order and Challan', code: 'QUOTATION_NOT_FINALIZED' });
    }
    if (!quotation.warehouseId) return res.status(409).json({ error: 'Select a source warehouse before converting the quotation.', code: 'WAREHOUSE_REQUIRED' });
    const warehouse = await Warehouse.findById(quotation.warehouseId);
    if (!warehouse) return res.status(404).json({ error: 'Quotation warehouse not found', code: 'WAREHOUSE_NOT_FOUND' });

    let customer = quotation.customerId ? await Customer.findById(quotation.customerId) : null;
    if (!customer && quotation.customerName) {
      const escaped = String(quotation.customerName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = await Customer.find({ $or: [{ name: new RegExp(`^${escaped}$`, 'i') }, { company: new RegExp(`^${escaped}$`, 'i') }] }).limit(2);
      if (matches.length === 1) customer = matches[0];
    }
    if (!customer) return res.status(409).json({ error: 'Link the quotation to a CRM Customer before fulfillment.', code: 'CUSTOMER_REQUIRED' });

    let order = quotation.salesOrderId ? await Order.findById(quotation.salesOrderId) : null;
    if (!order) order = await Order.findOne({ clientOrderRef: `QUOTATION:${quotation._id}` });
    if (!order) {
      const result = await createSalesOrder({
        customerId: customer._id,
        clientOrderRef: `QUOTATION:${quotation._id}`,
        orderChannel: 'crm',
        sourceType: 'direct',
        warehouseId: warehouse._id,
        shippingAddress: quotation.shippingAddress || customer.shippingAddress?.street || customer.billingAddress?.street || '-',
        billingAddress: quotation.partyAddress || customer.billingAddress?.street || '',
        notes: `Created from finalized quotation ${quotation.quotationNo}`,
        items: (quotation.items || []).map((item) => ({
          productId: item.productId,
          name: item.name,
          qty: Number(item.qty || item.boxes || 0),
          price: Number(item.rate || 0),
          freeQty: 0,
          discountPercent: Number(item.discountPercent || 0),
          pricingSource: 'finalized_quotation',
        })),
      }, { customer, fixedPricing: true, preApproved: true, notePrefix: `Quotation ${quotation.quotationNo}. ` });
      order = result.order;
    }

    let challan = await Challan.findOne({ salesOrderId: order._id, status: { $ne: 'cancelled' } });
    if (!challan) {
      const fulfillmentItems = order.items.map((item) => {
        const quoted = (quotation.items || []).find((row) => String(row.productId) === String(item.productId));
        return {
          productId: item.productId,
          qty: Number(item.qty || 0) + Number(item.freeQty || 0),
          packing: Number(quoted?.packing || 1),
          batchNo: quoted?.batchNo || undefined,
        };
      });
      challan = await createDraftFulfillment(order, { warehouseId: warehouse._id, items: fulfillmentItems });
      challan.mode = quotation.mode === 'cash' ? 'regular' : 'pakka';
      challan.partyAddress = quotation.partyAddress || '';
      challan.gstin = quotation.gstin || customer.gstin || '';
      challan.stateOfSupply = quotation.stateOfSupply || customer.state || '';
      challan.notes = `Created from quotation ${quotation.quotationNo}`;
      await challan.save();
    }
    quotation.customerId = customer._id;
    quotation.customerName = customer.company || customer.name;
    quotation.status = 'converted';
    quotation.convertedToOrder = true;
    quotation.salesOrderId = order._id;
    quotation.orderNo = order.orderNo;
    quotation.convertedToChallan = true;
    quotation.challanId = challan._id;
    quotation.challanNo = challan.challanNo;
    quotation.convertedAt = new Date();
    await quotation.save();
    if (req.io) req.io.emit('challan_updated', { type: 'created_from_quotation', id: challan._id });
    await logAction({ action: 'CONVERT_QUOTATION_TO_ORDER_AND_CHALLAN', description: `Converted quotation ${quotation.quotationNo} → Sales Order ${order.orderNo} → Challan ${challan.challanNo}`, details: { quotationId: quotation._id, orderId: order._id, challanId: challan._id }, req });
    res.status(201).json({ message: 'Quotation converted to a Sales Order and draft Sale Challan. Finalize the Challan to move stock.', order, challan, quotation });
  } catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code || 'QUOTATION_CONVERSION_FAILED' }); }
});

// Direct Quotation → Invoice bypass is retired; physical fulfillment must be represented by a posted Sale Challan first.
router.post('/:id/convert-to-invoice', authorize('quotation:edit'), (_req, res) => res.status(410).json({
  error: 'Direct Quotation to Invoice conversion is retired. Convert the quotation to a Sales Order and Sale Challan, post the Challan, then create the invoice from it.',
  code: 'QUOTATION_ORDER_CHALLAN_REQUIRED'
}));

module.exports = router;
