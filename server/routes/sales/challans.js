const express = require('express');
const mongoose = require('mongoose');
const Challan = require('../../models/Challan');
const Warehouse = require('../../models/Warehouse');
const { postChallanInventory, reverseChallanInventory } = require('../../services/challanInventoryService');
const idempotency = require('../../middleware/idempotency');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Invoice = require('../../models/Invoice');
const SystemSettings = require('../../models/SystemSettings');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { withTransaction } = require('../../utils/withTransaction');

const router = express.Router();

// GET /api/challans — List challans with search and mode filters
router.get('/', authorize('challan:view'), async (req, res) => {
  try {
    const { search, customerId, mode, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { challanNo: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({ error: 'Invalid customerId', code: 'INVALID_CUSTOMER_ID' });
      }
      filter.customerId = customerId;
    }
    if (mode && mode !== 'all') {
      if (!['regular', 'pakka', 'cash'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid Challan mode', code: 'INVALID_CHALLAN_MODE' });
      }
      filter.mode = mode;
    }

    if (!filter.mode) filter.mode = { $in: ['regular', 'pakka', 'cash'] };
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    const [challans, total] = await Promise.all([
      Challan.find(filter).sort({ date: -1, challanNo: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Challan.countDocuments(filter)
    ]);
    res.json({ data: challans, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/challans — Create new challan in DRAFT status (no inventory deduction yet)
router.post('/', authorize('challan:create'), validate(schemas.challanSchema), async (req, res) => {
  try {
    let challanNo = req.body.challanNo;
    if (!challanNo) {
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      const pfx = settings.challanPrefix || 'CH';
      challanNo = await generateAtomicDocumentNumber(`challanNo_${pfx}`, `${pfx}-`, 5);
    } else if (await Challan.exists({ challanNo })) {
      return res.status(409).json({ error: `Challan number ${challanNo} already exists`, code: 'DUPLICATE_CHALLAN_NO' });
    }

    const data = {
      ...req.body,
      challanNo,
      status: 'draft', // always draft on creation
    };

    data.challanType = data.challanType || 'sale';
    if (data.challanType !== 'sale' && !data.destinationWarehouseId) {
      return res.status(400).json({ error: 'Destination warehouse is required for transfer Challans', code: 'DESTINATION_WAREHOUSE_REQUIRED' });
    }
    if (data.challanType !== 'sale' && data.destinationWarehouseId && String(data.destinationWarehouseId) === String(data.warehouseId)) {
      return res.status(400).json({ error: 'Source and destination warehouses must be different', code: 'SAME_WAREHOUSE_TRANSFER' });
    }

    if (data.challanType === 'sale') {
      if (!data.salesOrderId) {
        return res.status(400).json({
          error: 'A linked Sales Order is required for every Sale Challan',
          code: 'SALES_ORDER_REQUIRED',
        });
      }
      const order = await Order.findById(data.salesOrderId);
      if (!order) return res.status(404).json({ error: 'Linked Sales Order not found', code: 'ORDER_NOT_FOUND' });
      if (['draft', 'cancelled', 'fulfilled', 'shipped', 'delivered'].includes(order.status)) {
        return res.status(409).json({ error: `Sales Order is ${order.status} and cannot accept another Challan`, code: 'ORDER_NOT_FULFILLABLE' });
      }
      data.customerId = order.customerId;
      data.partyName = order.name || data.partyName;
      if (!data.customerId) {
        return res.status(409).json({ error: 'The linked Sales Order has no customer', code: 'ORDER_CUSTOMER_REQUIRED' });
      }
      const customer = await Customer.findById(data.customerId);
      if (!customer) return res.status(404).json({ error: 'Selected customer not found', code: 'CUSTOMER_NOT_FOUND' });
      data.partyName = customer.company || customer.name || data.partyName;
      data.gstin = data.gstin || customer.gstin || '';
      data.stateOfSupply = data.stateOfSupply || customer.state || '';
    }

    if (!data.warehouseId) {
      return res.status(400).json({ error: 'Source warehouse is required' });
    }

    const warehouse = await Warehouse.findById(data.warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Selected warehouse not found' });
    }
    data.warehouseName = warehouse.name;

    if (data.challanType !== 'sale') {
      const destination = await Warehouse.findById(data.destinationWarehouseId);
      if (!destination) return res.status(404).json({ error: 'Destination warehouse not found', code: 'DESTINATION_WAREHOUSE_NOT_FOUND' });
      data.destinationWarehouseName = destination.name;
    }

    const challan = await Challan.create(data);
    if (challan.challanType === 'sale') {
      await Order.updateOne({ _id: challan.salesOrderId }, { $addToSet: { challanIds: challan._id } });
    }
    if (req.io) {
      req.io.emit('challan_updated', { type: 'created', id: challan._id });
    }
    res.status(201).json(challan);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_CHALLAN_DRAFT',
      description: `Created challan draft: ${challan.challanNo} (Party: ${challan.partyName}, Amt: ₹${challan.nettTotal})`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/challans/:id — Update an existing draft challan
router.put('/:id', authorize('challan:edit'), validate(schemas.challanSchema.partial()), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status !== 'draft' || challan.inventoryPostingStatus !== 'not_posted') {
      return res.status(409).json({ error: 'Only an unposted draft Challan can be edited', code: 'CHALLAN_NOT_EDITABLE' });
    }

    const update = { ...req.body, status: 'draft' };
    const nextType = update.challanType || challan.challanType;
    const nextOrderId = update.salesOrderId === undefined ? challan.salesOrderId : update.salesOrderId;
    const nextWarehouseId = update.warehouseId || challan.warehouseId;
    const nextDestinationId = update.destinationWarehouseId === undefined
      ? challan.destinationWarehouseId
      : update.destinationWarehouseId;

    if (nextType === 'sale') {
      if (!nextOrderId) {
        return res.status(400).json({ error: 'A linked Sales Order is required for every Sale Challan', code: 'SALES_ORDER_REQUIRED' });
      }
      const order = await Order.findById(nextOrderId);
      if (!order) return res.status(404).json({ error: 'Linked Sales Order not found', code: 'ORDER_NOT_FOUND' });
      if (['draft', 'cancelled', 'fulfilled', 'shipped', 'delivered'].includes(order.status)) {
        return res.status(409).json({ error: `Sales Order is ${order.status} and cannot accept another Challan`, code: 'ORDER_NOT_FULFILLABLE' });
      }
      if (!order.customerId) {
        return res.status(409).json({ error: 'The linked Sales Order has no customer', code: 'ORDER_CUSTOMER_REQUIRED' });
      }
      update.salesOrderId = order._id;
      update.customerId = order.customerId;
      update.partyName = order.name || update.partyName || challan.partyName;
    } else {
      update.salesOrderId = null;
      if (!nextDestinationId) {
        return res.status(400).json({ error: 'Destination warehouse is required for transfer Challans', code: 'DESTINATION_WAREHOUSE_REQUIRED' });
      }
      if (String(nextDestinationId) === String(nextWarehouseId)) {
        return res.status(400).json({ error: 'Source and destination warehouses must be different', code: 'SAME_WAREHOUSE_TRANSFER' });
      }
    }

    if (!nextWarehouseId) return res.status(400).json({ error: 'Source warehouse is required', code: 'SOURCE_WAREHOUSE_REQUIRED' });
    const warehouse = await Warehouse.findById(nextWarehouseId);
    if (!warehouse) return res.status(404).json({ error: 'Selected warehouse not found', code: 'SOURCE_WAREHOUSE_NOT_FOUND' });
    update.warehouseId = warehouse._id;
    update.warehouseName = warehouse.name;

    if (nextType !== 'sale') {
      const destination = await Warehouse.findById(nextDestinationId);
      if (!destination) return res.status(404).json({ error: 'Destination warehouse not found', code: 'DESTINATION_WAREHOUSE_NOT_FOUND' });
      update.destinationWarehouseId = destination._id;
      update.destinationWarehouseName = destination.name;
    }

    const previousOrderId = challan.salesOrderId ? String(challan.salesOrderId) : null;
    Object.assign(challan, update);
    const updated = await challan.save();
    const nextSavedOrderId = updated.salesOrderId ? String(updated.salesOrderId) : null;
    if (previousOrderId && previousOrderId !== nextSavedOrderId) {
      await Order.updateOne({ _id: previousOrderId }, { $pull: { challanIds: updated._id } });
    }
    if (nextSavedOrderId) {
      await Order.updateOne({ _id: nextSavedOrderId }, { $addToSet: { challanIds: updated._id } });
    }
    if (req.io) {
      req.io.emit('challan_updated', { type: 'updated', id: updated._id });
    }
    res.json(updated);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'UPDATE_CHALLAN',
      description: `Updated challan draft: ${challan.challanNo}`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/challans/:id/finalize — post the authoritative physical-goods transaction
router.patch('/:id/finalize', idempotency, authorize('challan:finalize'), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status === 'finalized') return res.status(409).json({ error: 'Challan is already finalized', code: 'CHALLAN_ALREADY_POSTED' });

    if (challan.challanType !== 'sale' && !challan.destinationWarehouseId) {
      return res.status(400).json({ error: 'Destination warehouse is required for a transfer Challan', code: 'DESTINATION_WAREHOUSE_REQUIRED' });
    }

    const posted = await postChallanInventory(challan, {
      userId: req.user ? req.user.id : null,
      createdBy: req.user ? req.user.name : 'System'
    });

    // Financial receivables are created only when the derived Sale Invoice is finalized.

    if (req.io) {
      req.io.emit('challan_updated', { type: 'finalized', id: posted._id });
      req.io.emit('inventory_updated', { type: 'challan_finalized', challanId: posted._id, challanType: posted.challanType });
    }

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: posted.challanType === 'sale' ? 'FINALIZE_CHALLAN' : 'POST_TRANSFER_CHALLAN',
      description: `Posted ${posted.challanType} Challan: ${posted.challanNo}`,
      details: { id: posted._id, destinationWarehouseId: posted.destinationWarehouseId || null },
      req
    });

    res.json(posted);
  } catch (err) {
    console.error('Challan finalization failed:', err);
    const status = ['INSUFFICIENT_STOCK','CHALLAN_NOT_POSTABLE','SAME_WAREHOUSE_TRANSFER','DESTINATION_WAREHOUSE_REQUIRED','SOURCE_WAREHOUSE_REQUIRED','PRODUCT_NOT_FOUND','INVALID_QUANTITY','SALES_ORDER_REQUIRED','ORDER_NOT_FOUND','ORDER_NOT_FULFILLABLE','ORDER_APPROVAL_REQUIRED','ORDER_CUSTOMER_REQUIRED','ORDER_CUSTOMER_MISMATCH','FULFILLMENT_EXCEEDS_REMAINING','ORDER_ITEM_NOT_FOUND'].includes(err.code) ? 409 : 500;
    res.status(status).json({ error: err.message, code: err.code || 'INVENTORY_TRANSACTION_FAILED', details: err.details || undefined });
  }
});

// POST /api/challans/:id/reverse — controlled compensating reversal for a posted Challan
router.post('/:id/reverse', idempotency, authorize('challan:delete'), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found', code: 'CHALLAN_NOT_FOUND' });
    const reversed = await reverseChallanInventory(challan, {
      userId: req.user ? req.user.id : null,
      createdBy: req.user ? req.user.name : 'System'
    });
    if (req.io) {
      req.io.emit('challan_updated', { type: 'reversed', id: reversed._id });
      req.io.emit('inventory_updated', { type: 'challan_reversed', challanId: reversed._id });
    }
    res.json(reversed);
  } catch (err) {
    const status = ['CHALLAN_NOT_FOUND','CHALLAN_NOT_REVERSIBLE','CHALLAN_ALREADY_REVERSED','REVERSAL_STOCK_SLOT_NOT_FOUND','REVERSAL_DESTINATION_STOCK_MISSING'].includes(err.code) ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code || 'CHALLAN_REVERSAL_FAILED', details: err.details || undefined });
  }
});

// DELETE /api/challans/:id — only drafts may be deleted; posted Challans are immutable truth documents
router.delete('/:id', authorize('challan:delete'), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.status === 'finalized') {
      return res.status(409).json({
        error: 'Posted Challans are immutable and cannot be deleted. Use the controlled reversal workflow.',
        code: 'POSTED_CHALLAN_IMMUTABLE'
      });
    }

    await Challan.findByIdAndDelete(req.params.id);
    if (req.io) req.io.emit('challan_updated', { type: 'deleted', id: req.params.id });
    res.json({ message: 'Challan deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'CHALLAN_DELETE_FAILED' });
  }
});

// Helper to get financial year string
function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 3 ? `${year}-${(year + 1).toString().slice(-2)}` : `${year - 1}-${year.toString().slice(-2)}`;
}

// POST /api/challans/:id/convert — Create the financial invoice derived from a posted Sale Challan.
router.post('/:id/convert', idempotency, authorize('invoice:create'), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found', code: 'CHALLAN_NOT_FOUND' });
    if (challan.challanType !== 'sale') return res.status(409).json({ error: 'Only Sale Challans can be converted to Sale Invoices', code: 'NOT_SALE_CHALLAN' });
    if (challan.status !== 'finalized' || challan.inventoryPostingStatus !== 'posted') {
      return res.status(409).json({ error: 'Finalize the Challan before creating its invoice.', code: 'CHALLAN_NOT_POSTED' });
    }
    if (challan.convertedToInvoice || challan.invoiceId) {
      const existing = challan.invoiceId ? await Invoice.findById(challan.invoiceId) : null;
      if (existing && existing.status !== 'cancelled') {
        return res.status(409).json({ error: `Challan is already converted to Sale Invoice ${existing.invoiceNo || challan.invoiceNo}`, code: 'CHALLAN_ALREADY_INVOICED' });
      }
    }
    if (!challan.customerId) return res.status(409).json({ error: 'Sale Challan has no linked customer', code: 'CUSTOMER_REQUIRED' });
    const customer = await Customer.findById(challan.customerId);
    if (!customer) return res.status(404).json({ error: 'Linked customer not found', code: 'CUSTOMER_NOT_FOUND' });

    const finalGstin = String(challan.gstin || customer.gstin || '').trim();
    if (!finalGstin) return res.status(400).json({ error: 'Customer is not GSTIN registered. Sale invoices can only be created for customers with a valid GSTIN.', code: 'GSTIN_REQUIRED' });

    const fy = getFinancialYearString();
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'VP';
    const prefix = `${pfx}/${fy}/`;
    const invoiceNo = await generateAtomicDocumentNumber(`invoiceNo_${prefix}`, prefix, 5);
    const state = String(challan.stateOfSupply || customer.state || 'Uttar Pradesh').trim();
    const isIntraState = finalGstin.startsWith('09') || ['uttar pradesh', 'up'].includes(state.toLowerCase());

    let totalBase = 0;
    let totalTax = 0;
    const invoiceItems = (challan.items || []).map((it) => {
      const physical = Number(it.qty || 0);
      const billable = it.billableQty == null ? Math.max(0, physical - Number(it.freeQty || 0)) : Number(it.billableQty || 0);
      const freeQty = Math.max(0, physical - billable);
      const rate = Number(it.rate || 0);
      const itemBase = billable * rate;
      const gst = Number(it.gstRate || 0);
      totalBase += itemBase;
      totalTax += itemBase * gst / 100;
      return {
        productId: it.productId,
        name: it.name,
        qty: billable,
        boxes: billable,
        freeQty,
        packing: Number(it.packing || 1),
        rate,
        hsnCode: it.hsnCode || '',
        gstRate: gst,
        batchNo: it.batchNo || '',
      };
    });

    const cgst = isIntraState ? totalTax / 2 : 0;
    const sgst = isIntraState ? totalTax / 2 : 0;
    const igst = isIntraState ? 0 : totalTax;
    const rawTotal = totalBase + totalTax;
    const amount = Math.round(rawTotal);
    const roundOff = amount - rawTotal;

    const invoice = await withTransaction(async (session) => {
      const locked = await Challan.findById(challan._id).session(session);
      if (!locked || locked.status !== 'finalized' || locked.inventoryPostingStatus !== 'posted') {
        throw Object.assign(new Error('Challan is no longer postable to invoice'), { code: 'CHALLAN_NOT_POSTED' });
      }
      if (locked.convertedToInvoice || locked.invoiceId) {
        const prior = locked.invoiceId ? await Invoice.findById(locked.invoiceId).session(session) : null;
        if (prior && prior.status !== 'cancelled') throw Object.assign(new Error('Challan has already been invoiced'), { code: 'CHALLAN_ALREADY_INVOICED' });
      }
      const [created] = await Invoice.create([{
        invoiceNo,
        customerId: customer._id,
        customerName: customer.company || customer.name || locked.partyName,
        firmDetails: {
          name: settings.firmName || '',
          address: settings.firmAddress || '',
          email: settings.firmEmail || '',
          phone: settings.firmPhone || '',
          gstin: settings.firmGstin || '',
          bankName: settings.bankName || '',
          bankAccountNo: settings.bankAccountNo || '',
          bankIfsc: settings.bankIfsc || '',
          bankBranch: settings.bankBranch || '',
        },
        partyAddress: locked.partyAddress,
        shippingAddress: locked.shippingAddress,
        date: new Date(),
        amount,
        status: 'draft',
        mode: 'pakka',
        baseAmount: totalBase,
        cgst,
        sgst,
        igst,
        roundOff,
        stateOfSupply: state,
        gstin: finalGstin,
        warehouseId: locked.warehouseId,
        warehouseName: locked.warehouseName,
        deductInventory: false,
        isFinalized: false,
        type: 'sale',
        sourceDocType: 'Challan',
        sourceDocId: locked._id,
        reference: String(locked._id),
        items: invoiceItems,
      }], { session });

      locked.convertedToInvoice = true;
      locked.invoiceId = created._id;
      locked.invoiceNo = created.invoiceNo;
      await locked.save({ session });
      if (locked.salesOrderId) {
        await Order.updateOne({ _id: locked.salesOrderId }, { $addToSet: { invoiceIds: created._id } }, { session });
      }
      return created;
    });

    if (req.io) {
      req.io.emit('challan_updated', { type: 'converted', id: challan._id });
      req.io.emit('invoice_updated', { type: 'created_from_challan', id: invoice._id });
    }
    const { logAction } = require('../../utils/auditLogger');
    await logAction({ action: 'CONVERT_CHALLAN_TO_INVOICE', description: `Converted challan ${challan.challanNo} to invoice: ${invoice.invoiceNo}`, details: { challanId: challan._id, invoiceId: invoice._id }, req });
    res.status(201).json({ message: 'Challan successfully converted to Sale Invoice', invoice });
  } catch (err) {
    const status = ['CHALLAN_NOT_POSTED','CHALLAN_ALREADY_INVOICED','CUSTOMER_REQUIRED','NOT_SALE_CHALLAN'].includes(err.code) ? 409 : (['CHALLAN_NOT_FOUND','CUSTOMER_NOT_FOUND'].includes(err.code) ? 404 : 500);
    res.status(status).json({ error: err.message, code: err.code || 'CHALLAN_INVOICE_CONVERSION_FAILED' });
  }
});

// PATCH /api/challans/:id/documents — Add a supporting document
router.patch('/:id/documents', authorize('challan:edit'), async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Document name and url are required' });

    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    const { getRenamedFilename, appendDocument } = require('../../utils/documentHelper');
    const cleanDocName = getRenamedFilename(name, 'challan', challan.challanNo || challan._id);
    const updatedChallan = await appendDocument(Challan, req.params.id, cleanDocName, url);

    res.json(updatedChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/challans/:id/documents — Remove a supporting document
router.delete('/:id/documents', authorize('challan:edit'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Document URL is required' });

    const { removeDocument } = require('../../utils/documentHelper');
    const updatedChallan = await removeDocument(Challan, req.params.id, url);

    res.json(updatedChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
