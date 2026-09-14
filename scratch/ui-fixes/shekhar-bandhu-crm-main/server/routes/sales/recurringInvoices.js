const express = require('express');
const RecurringInvoice = require('../../models/RecurringInvoice');
const { createSalesOrder } = require('../../services/salesOrderService');
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

    if (!templateName || !customerId || !customerName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'templateName, customerId, customerName, and items array are required' });
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

// POST /api/recurring-invoices/:id/generate-now — Generate a Sales Order, never a physical-goods invoice directly.
router.post('/:id/generate-now', authorize('order:create'), async (req, res) => {
  try {
    const template = await RecurringInvoice.findById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Recurring order template not found' });
    if (template.status !== 'active') return res.status(409).json({ error: `Template is ${template.status}`, code: 'RECURRING_TEMPLATE_INACTIVE' });
    if (!template.customerId) return res.status(409).json({ error: 'Template is not linked to a CRM customer', code: 'CUSTOMER_LINK_REQUIRED' });

    const result = await createSalesOrder({
      customerId: template.customerId,
      warehouseId: req.body.warehouseId || null,
      items: (template.items || []).map(it => ({ productId: it.productId, qty: Number(it.qty || 0) })),
      shippingAddress: req.body.shippingAddress || '',
      sourceType: 'recurring',
      orderChannel: 'crm',
      notes: `Generated from recurring template ${template.templateName}`,
    });

    const currentRun = new Date(template.nextRunDate);
    if (template.frequency === 'weekly') currentRun.setDate(currentRun.getDate() + 7);
    else if (template.frequency === 'quarterly') currentRun.setMonth(currentRun.getMonth() + 3);
    else currentRun.setMonth(currentRun.getMonth() + 1);

    template.lastRunDate = new Date();
    template.nextRunDate = currentRun;
    template.generatedOrdersCount = Number(template.generatedOrdersCount || 0) + 1;
    template.lastGeneratedOrderId = result.order._id;
    await template.save();

    res.status(result.approvalRequired ? 202 : 201).json({
      message: `Sales Order ${result.order.orderNo} generated from recurring template. Finalize a Sale Challan to move goods.`,
      order: result.order,
      approvalRequired: result.approvalRequired,
      credit: result.credit,
      recurringTemplate: template,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code || 'RECURRING_ORDER_FAILED' });
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
