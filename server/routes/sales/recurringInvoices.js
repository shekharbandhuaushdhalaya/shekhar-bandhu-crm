const express = require('express');
const RecurringInvoice = require('../../models/RecurringInvoice');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/recurring-invoices — List recurring invoices
router.get('/', authorize('invoice:view'), async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { templateName: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } }
      ];
    }
    const templates = await RecurringInvoice.find(filter).sort({ nextRunDate: 1 }).lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recurring-invoices — Create recurring invoice template
router.post('/', authorize('invoice:create'), async (req, res) => {
  try {
    const { templateName, customerId, customerName, frequency = 'monthly', startDate, items, status } = req.body;

    if (!templateName || !customerName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'templateName, customerName, and items array are required' });
    }

    let totalAmount = 0;
    const processedItems = items.map(it => {
      const qty = Number(it.qty || 1);
      const rate = Number(it.rate || 0);
      const packing = Number(it.packing || 1);
      const base = qty * rate * packing;
      const gstRate = Number(it.gstRate || 0);
      const tax = (base * gstRate) / 100;
      const amt = Number((base + tax).toFixed(2));
      totalAmount += amt;
      return {
        productId: it.productId || null,
        name: it.name || 'Recurring Item',
        packing,
        qty,
        rate,
        gstRate,
        amount: amt
      };
    });

    const nextRunDate = startDate ? new Date(startDate) : new Date();

    const template = await RecurringInvoice.create({
      templateName,
      customerId: customerId || null,
      customerName,
      frequency,
      nextRunDate,
      items: processedItems,
      totalAmount: Number(totalAmount.toFixed(2)),
      status: status || 'active',
      createdBy: req.user ? req.user.name : 'System'
    });

    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/recurring-invoices/:id/generate-now — Manually trigger invoice generation
router.post('/:id/generate-now', authorize('invoice:create'), async (req, res) => {
  try {
    const template = await RecurringInvoice.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Recurring invoice template not found' });

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const prefix = `SB/${fy}/`;
    const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
    const invoiceNo = await generateAtomicDocumentNumber(`invoiceNo_${prefix}`, prefix, 4);

    const invoiceItems = template.items.map(it => ({
      productId: it.productId,
      name: it.name,
      packing: it.packing,
      qty: it.qty,
      boxes: it.qty,
      rate: it.rate,
      gstRate: it.gstRate,
      amount: it.amount
    }));

    const invoice = await Invoice.create({
      invoiceNo,
      type: 'sale',
      mode: 'regular',
      date: new Date(),
      partyName: template.customerName,
      customerId: template.customerId,
      items: invoiceItems,
      baseAmount: template.totalAmount,
      totalAmount: template.totalAmount,
      nettTotal: template.totalAmount,
      status: 'unpaid',
      isFinalized: false,
      createdBy: req.user ? req.user.name : 'System Scheduler'
    });

    // Advance nextRunDate based on frequency
    const currentRun = new Date(template.nextRunDate);
    if (template.frequency === 'weekly') {
      currentRun.setDate(currentRun.getDate() + 7);
    } else if (template.frequency === 'quarterly') {
      currentRun.setMonth(currentRun.getMonth() + 3);
    } else {
      currentRun.setMonth(currentRun.getMonth() + 1);
    }

    template.lastRunDate = new Date();
    template.nextRunDate = currentRun;
    template.generatedInvoicesCount = (template.generatedInvoicesCount || 0) + 1;
    template.lastGeneratedInvoiceId = invoice._id;
    await template.save();

    res.status(201).json({
      message: `Invoice ${invoiceNo} generated successfully from recurring template`,
      invoice,
      recurringTemplate: template
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recurring-invoices/:id/status — Update status (active/paused/cancelled)
router.patch('/:id/status', authorize('invoice:edit'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const template = await RecurringInvoice.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
