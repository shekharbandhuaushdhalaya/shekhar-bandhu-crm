const express = require('express');
const Quotation = require('../../models/Quotation');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

// GET /api/quotations — List quotations
router.get('/', async (req, res) => {
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
router.post('/', validate(schemas.quotationSchema), async (req, res) => {
  try {
    const data = {
      ...req.body,
      quotationNo: req.body.quotationNo || 'QUOTE-' + Date.now().toString().slice(-6),
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
router.put('/:id', validate(schemas.quotationSchema.partial()), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    
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

// Helper for financial year string
function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// POST /api/quotations/:id/convert-to-challan — Convert Quotation to Draft Delivery Challan
router.post('/:id/convert-to-challan', authorize('quotation:edit'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    if (quotation.convertedToChallan) {
      return res.status(400).json({ error: `Quotation has already been converted to Delivery Challan ${quotation.challanNo}` });
    }

    const StockMovement = require('../../models/StockMovement');
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.challanPrefix || 'DC';
    const fy = getFinancialYearString();
    const prefix = `${pfx}/${fy}/`;

    const lastDoc = await StockMovement.findOne({
      docNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastDoc) {
      const parts = lastDoc.docNo.split('/');
      if (parts.length === 3) nextNum = parseInt(parts[2], 10) + 1;
    }
    const docNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;

    const stockItems = (quotation.items || []).map(it => ({
      productId: it.productId,
      productName: it.name || '',
      qty: it.qty || 0,
      packing: it.packing || 1,
      rate: it.rate || 0,
      gstRate: it.gstRate || 0,
      batchNo: '',
      mrp: 0
    }));

    const stockMovement = await StockMovement.create({
      docNo,
      direction: 'out',
      type: 'sale',
      billingMode: quotation.mode === 'cash' ? 'cash' : 'regular',
      date: new Date(),
      partyType: 'customer',
      partyName: quotation.customerName,
      partyGstin: quotation.gstin,
      partyAddress: quotation.partyAddress || quotation.shippingAddress,
      items: stockItems,
      baseAmount: quotation.baseAmount || 0,
      cgst: quotation.cgst || 0,
      sgst: quotation.sgst || 0,
      igst: quotation.igst || 0,
      roundOff: quotation.roundOff || 0,
      totalAmount: quotation.amount || 0,
      status: 'draft', // DRAFT MODE!
      sourceDocType: 'Quotation',
      sourceDocId: quotation._id,
      warehouseId: quotation.warehouseId,
      warehouseName: quotation.warehouseName,
    });

    quotation.status = 'approved';
    quotation.convertedToChallan = true;
    quotation.challanNo = docNo;
    quotation.challanId = stockMovement._id;
    await quotation.save();

    res.status(201).json({
      message: 'Quotation successfully converted to draft Delivery Challan',
      stockMovement,
      quotation
    });

    await logAction({
      action: 'CONVERT_QUOTATION_TO_CHALLAN',
      description: `Converted quotation ${quotation.quotationNo} → Challan ${docNo} for ${quotation.customerName}`,
      details: { quotationId: quotation._id, quotationNo: quotation.quotationNo, challanNo: docNo, customer: quotation.customerName },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/quotations/:id/convert-to-invoice — One-click convert Quotation to Draft Sale Invoice
router.post('/:id/convert-to-invoice', authorize('quotation:edit'), async (req, res) => {
  try {
    const { winLossReason } = req.body;
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    if (quotation.convertedToInvoice) {
      return res.status(400).json({ error: `Quotation has already been converted to Sale Invoice ${quotation.invoiceNo}` });
    }

    const Invoice = require('../../models/Invoice');
    const SystemSettings = require('../../models/SystemSettings');
    const Customer = require('../../models/Customer');

    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'SB';
    const fy = getFinancialYearString();
    const prefix = `${pfx}/${fy}/`;

    const lastInv = await Invoice.findOne({
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastInv) {
      const parts = lastInv.invoiceNo.split('/');
      if (parts.length === 3) nextNum = parseInt(parts[2], 10) + 1;
    }
    const invNo = `${prefix}${nextNum.toString().padStart(4, '0')}`;

    const customerObj = await Customer.findOne({ name: { $regex: new RegExp('^' + quotation.customerName.trim() + '$', 'i') } }).lean();

    const invoiceItems = (quotation.items || []).map(it => ({
      productId: it.productId,
      name: it.name || '',
      size: it.size || '',
      packing: it.packing || 1,
      qty: it.qty || 0,
      boxes: it.boxes || it.qty || 0,
      rate: it.rate || 0,
      gstRate: it.gstRate || 0,
      amount: Number((((it.qty || 0) * (it.rate || 0) * (it.packing || 1)) * (1 + (it.gstRate || 0)/100)).toFixed(2)),
      batchNo: it.batchNo || ''
    }));

    const invoice = await Invoice.create({
      invoiceNo: invNo,
      type: 'sale',
      mode: quotation.mode === 'cash' ? 'cash' : 'pakka',
      date: new Date(),
      partyName: quotation.customerName,
      customerId: customerObj ? customerObj._id : null,
      partyAddress: quotation.partyAddress,
      shippingAddress: quotation.shippingAddress,
      gstin: quotation.gstin,
      items: invoiceItems,
      baseAmount: quotation.baseAmount || 0,
      cgst: quotation.cgst || 0,
      sgst: quotation.sgst || 0,
      igst: quotation.igst || 0,
      roundOff: quotation.roundOff || 0,
      totalAmount: quotation.amount || 0,
      nettTotal: quotation.amount || 0,
      status: 'unpaid',
      isFinalized: false,
      warehouseId: quotation.warehouseId,
      warehouseName: quotation.warehouseName
    });

    quotation.status = 'converted';
    quotation.convertedToInvoice = true;
    quotation.invoiceNo = invNo;
    quotation.invoiceId = invoice._id;
    quotation.winLossReason = winLossReason || 'Quotation accepted by customer';
    quotation.convertedAt = new Date();
    await quotation.save();

    res.status(201).json({
      message: 'Quotation successfully converted to draft Sale Invoice',
      invoice,
      quotation
    });

    await logAction({
      action: 'CONVERT_QUOTATION_TO_INVOICE',
      description: `Converted quotation ${quotation.quotationNo} → Invoice ${invNo} for ${quotation.customerName}`,
      details: { quotationId: quotation._id, quotationNo: quotation.quotationNo, invoiceNo: invNo, customer: quotation.customerName },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
