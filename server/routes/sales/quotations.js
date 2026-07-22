const express = require('express');
const Quotation = require('../../models/Quotation');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

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
    res.status(201).json(quotation);
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
    res.json(quotation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/quotations/:id — Delete quotation
router.delete('/:id', authorize('quotation:delete'), async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    
    res.json({ message: 'Quotation deleted' });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
