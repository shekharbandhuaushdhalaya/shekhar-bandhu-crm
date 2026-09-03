const express = require('express');
const Recall = require('../../models/Recall');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/recalls — List product recalls
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { batchNo, status } = req.query;
    const filter = {};
    if (batchNo) filter.batchNo = batchNo;
    if (status) filter.status = status;
    const recalls = await Recall.find(filter).sort({ createdAt: -1 }).lean();
    res.json(recalls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recalls — Initiate a batch recall & auto-trace affected customers
router.post('/', authorize('manufacturing:batchManage'), async (req, res) => {
  try {
    const { batchNo, productId, productName, reason, severity = 'class_II' } = req.body;

    if (!batchNo || !reason) {
      return res.status(400).json({ error: 'batchNo and reason are required' });
    }

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const recallNo = `RCL/${fy}/${Math.floor(1000 + Math.random() * 9000)}`;

    // Auto-trace sale invoices containing this batchNo
    const saleInvoices = await Invoice.find({
      type: 'sale',
      'items.batchNo': batchNo
    }).lean();

    const affectedCustomers = [];
    let totalAffectedQty = 0;

    for (const inv of saleInvoices) {
      for (const item of inv.items) {
        if (item.batchNo === batchNo) {
          const qty = item.qty || item.boxes || 0;
          totalAffectedQty += qty;
          affectedCustomers.push({
            customerId: inv.customerId || null,
            customerName: inv.partyName,
            invoiceNo: inv.invoiceNo,
            invoiceDate: inv.date,
            suppliedQty: qty,
            notified: false
          });
        }
      }
    }

    const recall = await Recall.create({
      recallNo,
      batchNo,
      productId: productId || null,
      productName: productName || 'Batch Product',
      reason,
      severity,
      affectedCustomers,
      totalAffectedQty,
      status: 'initiated',
      initiatedBy: req.user ? req.user.name : 'System'
    });

    if (req.io) req.io.emit('recall_initiated', recall);
    res.status(201).json(recall);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/recalls/:id/notify-customer — Mark affected customer as notified
router.patch('/:id/notify-customer', authorize('manufacturing:batchManage'), async (req, res) => {
  try {
    const { invoiceNo } = req.body;
    const recall = await Recall.findById(req.params.id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    const cust = recall.affectedCustomers.find(c => c.invoiceNo === invoiceNo);
    if (cust) {
      cust.notified = true;
      cust.notifiedAt = new Date();
      await recall.save();
    }

    res.json(recall);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recalls/:id/status — Update recall status
router.patch('/:id/status', authorize('manufacturing:batchManage'), async (req, res) => {
  try {
    const { status, recalledQty, closureNotes } = req.body;
    const recall = await Recall.findById(req.params.id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    if (status) recall.status = status;
    if (recalledQty !== undefined) recall.recalledQty = Number(recalledQty);
    if (closureNotes) recall.closureNotes = closureNotes;

    await recall.save();
    res.json(recall);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
