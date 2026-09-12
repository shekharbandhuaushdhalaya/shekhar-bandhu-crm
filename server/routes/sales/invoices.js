const express = require('express');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const Product = require('../../models/Product');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { calculateInvoiceTotals, resolveWarehouse } = require('../../services/invoiceService');
const { finalizeSaleInvoice, finalizePurchaseInvoice } = require('../../services/invoicePostingService');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');


function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, 0 = Jan, 3 = Apr
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

async function validateSaleInvoiceDate(dateToCheck) {
  if (!dateToCheck) return;
  const d = new Date(dateToCheck);
  d.setHours(0,0,0,0);
  
  const latestFinalized = await Invoice.findOne({ type: 'sale', isFinalized: true }).sort({ date: -1 }).lean();
  if (latestFinalized && latestFinalized.date) {
    const latestDate = new Date(latestFinalized.date);
    latestDate.setHours(0,0,0,0);
    if (d < latestDate) {
      throw new Error(`Cannot use this date. A finalized sale invoice already exists for a later date (${latestDate.toLocaleDateString('en-IN')}).`);
    }
  }
}

// Sale-side physical inventory is controlled exclusively by the authoritative Challan service.

const router = express.Router();

// GET /api/invoices/sales — List sale invoices
router.get('/sales', authorize('invoice:view'), async (req, res) => {
  try {
    const { search, mode, page, limit } = req.query;
    const filter = { type: 'sale' };

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    filter.mode = 'regular';

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Invoice.find(filter)
      .populate('prescribingDoctorId', 'name clinicName specialization category city')
      .sort({ date: -1, createdAt: -1 });
    
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const invoices = await query.lean();
    
    // Fetch associated dispatches
    const Dispatch = require('../../models/Dispatch');
    const invoiceIds = invoices.map(inv => inv._id);
    const dispatches = await Dispatch.find({ invoiceId: { $in: invoiceIds } }).lean();
    const dispatchMap = {};
    for (const d of dispatches) {
      if (d.invoiceId) {
        dispatchMap[d.invoiceId.toString()] = d;
      }
    }

    const enrichedInvoices = invoices.map(inv => ({
      ...inv,
      dispatch: dispatchMap[inv._id.toString()] || null
    }));

    if (isPaginated) {
      const total = await Invoice.countDocuments(filter);
      return res.json({
        data: enrichedInvoices,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(enrichedInvoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/purchases — List purchase invoices
router.get('/purchases', authorize('invoice:view'), async (req, res) => {
  try {
    const { search, mode, page, limit } = req.query;
    const filter = { type: 'purchase' };

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Invoice.find(filter).sort({ date: -1, createdAt: -1 });
    
    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const invoices = await query.lean();

    if (isPaginated) {
      const total = await Invoice.countDocuments(filter);
      return res.json({
        data: invoices,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/sales — retired: normal sale invoices must be derived from a posted Sale Challan.
router.post('/sales', authorize('invoice:create'), async (_req, res) => {
  return res.status(410).json({
    error: 'Direct Sale Invoice creation is retired. Finalize a Sale Challan and create the invoice from that Challan.',
    code: 'SALE_INVOICE_FROM_CHALLAN_REQUIRED'
  });
});

// POST /api/invoices/purchases — Create purchase invoice in DRAFT status (no inventory/balance changes yet)
router.post('/purchases', authorize('invoice:create'), validate(schemas.invoiceSchema), async (req, res) => {
  try {
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};

    const invoiceNo = req.body.invoiceNo ? req.body.invoiceNo.trim() : await generateAtomicDocumentNumber('purchaseInvoiceNo', 'INV-PURCH-', 6);
    const supplierName = req.body.supplierName ? req.body.supplierName.trim() : '';
    const existing = await Invoice.findOne({ type: 'purchase', invoiceNo, supplierName });
    if (existing) {
      return res.status(400).json({ error: `Purchase invoice number "${invoiceNo}" already exists for supplier "${supplierName || 'this supplier'}".` });
    }

    let vendorId = req.body.vendorId || null;
    if (!vendorId && supplierName) {
      const matches = await Vendor.find({ $or: [{ name: supplierName }, { company: supplierName }] }).limit(2);
      if (matches.length === 1) vendorId = matches[0]._id;
    }

    const data = {
      ...req.body,
      vendorId,
      type: 'purchase',
      invoiceNo,
      isFinalized: false,
      firmDetails: {
        name: settings.firmName || settings.name || '',
        address: settings.firmAddress || settings.address || '',
        email: settings.firmEmail || settings.email || '',
        phone: settings.firmPhone || settings.phone || '',
        gstin: settings.firmGstin || settings.gstin || '',
        bankName: settings.bankName || '',
        bankAccountNo: settings.bankAccountNo || '',
        bankIfsc: settings.bankIfsc || '',
        bankBranch: settings.bankBranch || ''
      }
    };
    const invoice = await Invoice.create(data);
    if (req.io) {
      req.io.emit('invoice_updated', { type: 'purchase_created', id: invoice._id });
    }
    res.status(201).json(invoice);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_PURCHASE_INVOICE_DRAFT',
      description: `Created purchase invoice draft: ${invoice.invoiceNo} (Supplier: ${invoice.supplierName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      const dupField = err.keyValue ? (err.keyValue.invoiceNo || Object.values(err.keyValue)[0]) : '';
      return res.status(400).json({ error: `Purchase invoice number "${dupField}" already exists for this supplier.` });
    }
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/invoices/:id — Edit invoice (allowed only in DRAFT status)
router.put('/:id', authorize('invoice:edit'), validate(schemas.invoiceSchema.partial()), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    
    if (invoice.isFinalized) {
      return res.status(409).json({ error: 'Finalized invoices are immutable. Use Payments, Sales Returns, Credit/Debit Notes, or other compensating workflows.', code: 'FINALIZED_INVOICE_IMMUTABLE' });
    }



    // Keep invoice type and number immutable during edits
    const { type, invoiceNo, ...updateData } = req.body;

    if (!invoice.isFinalized) {
      const SystemSettings = require('../../models/SystemSettings');
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      updateData.firmDetails = {
        name: settings.firmName || settings.name || '',
        address: settings.firmAddress || settings.address || '',
        email: settings.firmEmail || settings.email || '',
        phone: settings.firmPhone || settings.phone || '',
        gstin: settings.firmGstin || settings.gstin || '',
        bankName: settings.bankName || '',
        bankAccountNo: settings.bankAccountNo || '',
        bankIfsc: settings.bankIfsc || '',
        bankBranch: settings.bankBranch || ''
      };
    }
    
    if (invoice.type === 'sale' && updateData.date) {
      const oldDate = invoice.date ? new Date(invoice.date).setHours(0,0,0,0) : 0;
      const newDate = new Date(updateData.date).setHours(0,0,0,0);
      if (oldDate !== newDate) {
        await validateSaleInvoiceDate(updateData.date);
      }
    }

    Object.assign(invoice, updateData);
    await invoice.save();
    if (req.io) {
      req.io.emit('invoice_updated', { type: 'updated', id: invoice._id });
    }
    res.json(invoice);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'UPDATE_INVOICE',
      description: `Updated invoice draft: ${invoice.invoiceNo} (${invoice.type})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/invoices/sales/:id/finalize — Finalize the financial sale document. Physical stock was already posted by its Challan.
router.patch('/sales/:id/finalize', authorize('invoice:finalize'), async (req, res) => {
  try {
    const invoice = await finalizeSaleInvoice(req.params.id, { id: req.user?.id, name: req.user?.name || 'System' });
    if (req.io) req.io.emit('invoice_updated', { type: 'sale_finalized', id: invoice._id });
    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'FINALIZE_SALE_INVOICE',
      description: `Finalized sale invoice: ${invoice.invoiceNo} (Customer: ${invoice.customerName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id, sourceDocId: invoice.sourceDocId },
      req
    });
    res.json(invoice);
  } catch (err) {
    const businessCodes = new Set(['INVOICE_NOT_FOUND','INVOICE_ALREADY_FINALIZED','CUSTOMER_REQUIRED','CUSTOMER_NOT_FOUND','SALE_CHALLAN_REQUIRED','CHALLAN_NOT_POSTED','CUSTOMER_MISMATCH']);
    const status = err.code === 'INVOICE_NOT_FOUND' || err.code === 'CUSTOMER_NOT_FOUND' ? 404 : (businessCodes.has(err.code) ? 409 : 500);
    res.status(status).json({ error: err.message, code: err.code || 'SALE_INVOICE_FINALIZE_FAILED', details: err.details });
  }
});

// PATCH /api/invoices/purchases/:id/finalize — Post purchased inventory and vendor liability atomically.
router.patch('/purchases/:id/finalize', authorize('invoice:finalize'), async (req, res) => {
  try {
    const invoice = await finalizePurchaseInvoice(req.params.id, { id: req.user?.id, name: req.user?.name || 'System' });
    if (req.io) {
      req.io.emit('invoice_updated', { type: 'purchase_finalized', id: invoice._id });
      req.io.emit('inventory_updated', { type: 'purchase_invoice_finalized', invoiceId: invoice._id });
    }
    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'FINALIZE_PURCHASE_INVOICE',
      description: `Finalized purchase invoice: ${invoice.invoiceNo} (Supplier: ${invoice.supplierName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
    res.json(invoice);
  } catch (err) {
    const businessCodes = new Set(['INVOICE_NOT_FOUND','INVOICE_ALREADY_FINALIZED','WAREHOUSE_REQUIRED','WAREHOUSE_NOT_FOUND','VENDOR_REQUIRED','VENDOR_NOT_FOUND','PRODUCT_REQUIRED','PRODUCT_NOT_FOUND','RAW_MATERIAL_NOT_FOUND','INVALID_QUANTITY']);
    const status = ['INVOICE_NOT_FOUND','WAREHOUSE_NOT_FOUND','VENDOR_NOT_FOUND','PRODUCT_NOT_FOUND','RAW_MATERIAL_NOT_FOUND'].includes(err.code) ? 404 : (businessCodes.has(err.code) ? 409 : 500);
    res.status(status).json({ error: err.message, code: err.code || 'PURCHASE_INVOICE_FINALIZE_FAILED', details: err.details });
  }
});

// DELETE /api/invoices/sales/:id — only draft invoices can be cancelled. Finalized financial documents are immutable.
router.delete('/sales/:id', authorize('invoice:delete'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale' });
    if (!invoice) return res.status(404).json({ error: 'Sale invoice not found' });
    if (invoice.isFinalized) return res.status(409).json({ error: 'Finalized sale invoices are immutable. Use a Sales Return/Credit Note or other compensating document.', code: 'FINALIZED_INVOICE_IMMUTABLE' });

    if (invoice.sourceDocType === 'Challan' && invoice.sourceDocId) {
      const Challan = require('../../models/Challan');
      const Order = require('../../models/Order');
      await Challan.updateOne({ _id: invoice.sourceDocId, invoiceId: invoice._id }, { $set: { convertedToInvoice: false, invoiceId: null, invoiceNo: '' } });
      await Order.updateMany({ invoiceIds: invoice._id }, { $pull: { invoiceIds: invoice._id } });
    }
    invoice.status = 'cancelled';
    await invoice.save();
    if (req.io) req.io.emit('invoice_updated', { type: 'sale_cancelled', id: invoice._id });
    res.json({ message: 'Draft sale invoice cancelled', invoice });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SALE_INVOICE_CANCEL_FAILED' });
  }
});

// DELETE /api/invoices/purchases/:id — only drafts can be cancelled. Posted stock/liability cannot be silently rolled back.
router.delete('/purchases/:id', authorize('invoice:delete'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'purchase' });
    if (!invoice) return res.status(404).json({ error: 'Purchase invoice not found' });
    if (invoice.isFinalized) return res.status(409).json({ error: 'Finalized purchase invoices are immutable. Use the purchase return/debit-note correction workflow.', code: 'FINALIZED_INVOICE_IMMUTABLE' });
    invoice.status = 'cancelled';
    await invoice.save();
    if (req.io) req.io.emit('invoice_updated', { type: 'purchase_cancelled', id: invoice._id });
    res.json({ message: 'Draft purchase invoice cancelled', invoice });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'PURCHASE_INVOICE_CANCEL_FAILED' });
  }
});

// PATCH /api/invoices/:id/documents — Add a supporting document
router.patch('/:id/documents', authorize('invoice:edit'), async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Document name and url are required' });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { getRenamedFilename, appendDocument } = require('../../utils/documentHelper');
    const cleanDocName = getRenamedFilename(name, 'invoice', invoice.invoiceNo || invoice._id);
    const updatedInvoice = await appendDocument(Invoice, req.params.id, cleanDocName, url);

    res.json(updatedInvoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/:id/documents — Remove a supporting document
router.delete('/:id/documents', authorize('invoice:edit'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Document URL is required' });

    const { removeDocument } = require('../../utils/documentHelper');
    const updatedInvoice = await removeDocument(Invoice, req.params.id, url);

    res.json(updatedInvoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
