const express = require('express');
const Challan = require('../../models/Challan');
const Warehouse = require('../../models/Warehouse');
const { postChallanInventory, reverseChallanInventory } = require('../../services/challanInventoryService');
const idempotency = require('../../middleware/idempotency');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/challans — List challans with search and mode filters
router.get('/', async (req, res) => {
  try {
    const { search, mode, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { challanNo: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    filter.mode = { $in: ['pakka', 'regular'] };
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
router.post('/', validate(schemas.challanSchema), async (req, res) => {
  try {
    const { mode } = req.body;


    let challanNo = req.body.challanNo;
    if (!challanNo) {
      const SystemSettings = require('../../models/SystemSettings');
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      const pfx = settings.challanPrefix || 'CH';
      const lastChallan = await Challan.findOne({ challanNo: new RegExp(`^${pfx}-\\d+$`) }).sort({ createdAt: -1 }).lean();
      let nextNum = 1;
      if (lastChallan) {
        const parts = lastChallan.challanNo.split('-');
        if (parts.length === 3) {
          nextNum = parseInt(parts[2], 10) + 1;
        }
      }
      challanNo = `${pfx}-${nextNum.toString().padStart(3, '0')}`;
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
router.put('/:id', validate(schemas.challanSchema.partial()), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot edit a finalized challan' });
    }
    

    
    Object.assign(challan, req.body);
    const updated = await challan.save();
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
router.patch('/:id/finalize', idempotency, async (req, res) => {
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

    // Sale-only financial side effect. Internal/production transfers never affect customer balances.
    if (posted.challanType === 'sale' && posted.partyName && posted.nettTotal > 0) {
      const Customer = require('../../models/Customer');
      const cust = await Customer.findOne({ $or: [{ name: posted.partyName }, { company: posted.partyName }] });
      if (cust) {
        if (posted.mode === 'cash') cust.cashBalance = (cust.cashBalance || 0) + posted.nettTotal;
        else cust.regularBalance = (cust.regularBalance || 0) + posted.nettTotal;
        await cust.save();
      }
    }

    if (posted.salesOrderId) {
      const Order = require('../../models/Order');
      const order = await Order.findById(posted.salesOrderId);
      if (order) {
        const postedChallans = await Challan.find({ salesOrderId: order._id, status: 'finalized', inventoryPostingStatus: 'posted' }).lean();
        for (const oi of order.items) {
          oi.fulfilledQty = postedChallans.flatMap(c => c.items).filter(i => String(i.productId) === String(oi.productId)).reduce((sum, i) => sum + Number(i.qty || 0), 0);
          oi.backorderedQty = Math.max(0, Number(oi.qty || 0) + Number(oi.freeQty || 0) - Number(oi.fulfilledQty || 0));
        }
        const done = order.items.every(i => Number(i.backorderedQty || 0) <= 0);
        const any = order.items.some(i => Number(i.fulfilledQty || 0) > 0);
        order.status = done ? 'fulfilled' : (any ? 'partially_fulfilled' : 'processing');
        await order.save();
      }
    }

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
    const status = ['INSUFFICIENT_STOCK','CHALLAN_NOT_POSTABLE','SAME_WAREHOUSE_TRANSFER','DESTINATION_WAREHOUSE_REQUIRED','SOURCE_WAREHOUSE_REQUIRED','PRODUCT_NOT_FOUND','INVALID_QUANTITY'].includes(err.code) ? 400 : 500;
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
  const month = date.getMonth(); // 0-indexed, 0 = Jan, 3 = Apr
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// POST /api/challans/:id/convert — Convert a Challan to a Sale Invoice
router.post('/:id/convert', async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.convertedToInvoice) {
      return res.status(400).json({ error: `Challan is already converted to Sale Invoice ${challan.invoiceNo}` });
    }
    if (challan.status !== 'finalized' || challan.inventoryPostingStatus !== 'posted') {
      return res.status(409).json({ error: 'Finalize the Challan before creating its invoice.', code: 'CHALLAN_NOT_POSTED' });
    }



    // Check if customer is GSTIN registered
    const Customer = require('../../models/Customer');
    const customer = await Customer.findOne({
      $or: [
        { name: challan.partyName },
        { company: challan.partyName }
      ]
    });

    const finalGstin = (challan.gstin || (customer ? customer.gstin : '') || '').trim();
    if (!finalGstin) {
      return res.status(400).json({ error: 'Customer is not GSTIN registered. Sale invoices can only be created for customers with a valid GSTIN.' });
    }

    // Generate Invoice Number
    const Invoice = require('../../models/Invoice');
    const fy = getFinancialYearString();
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'VP';
    const prefix = `${pfx}/${fy}/`;
    
    const lastInvoice = await Invoice.findOne({ 
      type: 'sale',
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split('/');
      if (parts.length === 3) {
        nextNum = parseInt(parts[2], 10) + 1;
      }
    }
    const invoiceNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;

    const isIntraState = finalGstin.startsWith('09') || 
      ['uttar pradesh', 'up'].includes((challan.stateOfSupply || (customer ? customer.state : '') || 'Uttar Pradesh').trim().toLowerCase());

    // Recalculate base amount and tax amounts based on items and state of supply
    let totalBase = 0;
    let totalTax = 0;
    const invoiceItems = challan.items.map(it => {
      const itemBase = (it.qty || 0) * (it.rate || 0) * (it.packing || 1);
      totalBase += itemBase;
      const gst = it.gstRate || 0;
      totalTax += (itemBase * gst) / 100;

      return {
        productId: it.productId,
        name: it.name,
        qty: it.qty, // boxes (in sale.tsx, qty is boxes)
        boxes: it.qty, // quantity in boxes
        packing: it.packing || 1,
        rate: it.rate || 0,
        hsnCode: it.hsnCode || '',
        gstRate: it.gstRate || 0
      };
    });

    const cgst = isIntraState ? totalTax / 2 : 0;
    const sgst = isIntraState ? totalTax / 2 : 0;
    const igst = !isIntraState ? totalTax : 0;
    const rawTotal = totalBase + cgst + sgst + igst;
    const nettTotal = Math.round(rawTotal);
    const roundOff = nettTotal - rawTotal;

    // Create invoice data
    const invoiceData = {
      invoiceNo,
      customerId: customer ? customer._id : null,
      customerName: challan.partyName,
      partyAddress: challan.partyAddress,
      shippingAddress: challan.shippingAddress,
      date: new Date(),
      amount: nettTotal,
      status: 'draft',
      mode: 'pakka', // converted invoice is pakka
      baseAmount: totalBase,
      cgst,
      sgst,
      igst,
      roundOff,
      stateOfSupply: challan.stateOfSupply || (customer ? customer.state : '') || 'Uttar Pradesh',
      gstin: finalGstin,
      warehouseId: challan.warehouseId,
      warehouseName: challan.warehouseName,
      deductInventory: false, // Challan has already posted the authoritative physical stock movement.
      isFinalized: false, // create as draft
      type: 'sale',
      sourceDocType: 'Challan',
      sourceDocId: challan._id,
      reference: challan._id.toString(),
      items: invoiceItems
    };

    const invoice = await Invoice.create(invoiceData);

    // Update Challan to link to the invoice
    challan.convertedToInvoice = true;
    challan.invoiceId = invoice._id;
    challan.invoiceNo = invoice.invoiceNo;
    await challan.save();

    if (challan.salesOrderId) {
      const Order = require('../../models/Order');
      await Order.findByIdAndUpdate(challan.salesOrderId, { $addToSet: { invoiceIds: invoice._id } });
    }

    if (req.io) {
      req.io.emit('challan_updated', { type: 'converted', id: challan._id });
      req.io.emit('invoice_updated', { type: 'created_from_challan', id: invoice._id });
    }
    res.status(201).json({
      message: 'Challan successfully converted to Sale Invoice',
      invoice,
      challan
    });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CONVERT_CHALLAN_TO_INVOICE',
      description: `Converted challan ${challan.challanNo} to invoice: ${invoice.invoiceNo}`,
      details: { challanId: challan._id, invoiceId: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/challans/:id/documents — Add a supporting document
router.patch('/:id/documents', async (req, res) => {
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
router.delete('/:id/documents', async (req, res) => {
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
