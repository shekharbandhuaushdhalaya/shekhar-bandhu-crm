const express = require('express');
const Recall = require('../../models/Recall');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/idempotency');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

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
router.post('/', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { batchNo, productId, productName, reason, severity = 'class_II' } = req.body;
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!batchNo || String(batchNo).trim().length > 100 || !reason || String(reason).trim().length < 10 ||
        !['class_I', 'class_II', 'class_III'].includes(severity) || !actorId || !actorName) {
      return res.status(400).json({ error: 'Batch, substantive reason, valid severity and authenticated initiator are required', code: 'RECALL_INITIATION_EVIDENCE_REQUIRED' });
    }

    const fy = new Date().getFullYear() % 100 + '-' + (new Date().getFullYear() + 1) % 100;
    const recallNo = await generateAtomicDocumentNumber(`recallNo_${fy}`, `RCL/${fy}/`, 4);

    // Auto-trace sale invoices containing this batchNo
    const saleInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      'items.batchNo': batchNo
    }).lean();

    // One notification record per invoice: aggregate duplicate matching lines so
    // a single customer notification covers the complete invoice distribution.
    const affectedByInvoice = new Map();
    let totalAffectedQty = 0;
    for (const inv of saleInvoices) {
      const qty = (inv.items || []).filter(item => item.batchNo === batchNo)
        .reduce((sum, item) => sum + Number(item.qty || item.boxes || 0), 0);
      if (!(qty > 0)) continue;
      totalAffectedQty += qty;
      const key = String(inv._id || inv.invoiceNo);
      const current = affectedByInvoice.get(key) || {
        customerId: inv.customerId || null,
        customerName: inv.partyName || inv.customerName || 'Customer',
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.date,
        suppliedQty: 0,
        notified: false
      };
      current.suppliedQty += qty;
      affectedByInvoice.set(key, current);
    }
    const affectedCustomers = Array.from(affectedByInvoice.values());

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
      initiatedBy: actorName,
      initiatedByUserId: actorId
    });

    if (req.io) req.io.emit('recall_initiated', recall);
    res.status(201).json(recall);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/recalls/:id/notify-customer — Mark affected customer as notified
router.patch('/:id/notify-customer', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const invoiceNo = String(req.body.invoiceNo || '').trim();
    const method = String(req.body.notificationMethod || '').trim().toLowerCase();
    const reference = String(req.body.notificationReference || '').trim();
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!invoiceNo || !['email', 'phone', 'letter', 'portal', 'other'].includes(method) || !reference || !actorId || !actorName) {
      return res.status(400).json({ error: 'Affected invoice, notification method, evidence reference and authenticated recorder are required', code: 'RECALL_NOTIFICATION_EVIDENCE_REQUIRED' });
    }
    const recall = await Recall.findById(req.params.id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    const cust = recall.affectedCustomers.find(c => c.invoiceNo === invoiceNo);
    if (!cust) return res.status(404).json({ error: 'Invoice is not in this recall distribution list' });
    if (cust.notified) return res.status(409).json({ error: 'Notification is already recorded for this affected invoice', code: 'RECALL_NOTIFICATION_ALREADY_RECORDED' });
    const notifiedAt = new Date();
    const updated = await Recall.findOneAndUpdate({
      _id: recall._id,
      updatedAt: recall.updatedAt,
      affectedCustomers: { $elemMatch: { invoiceNo, notified: { $ne: true } } }
    }, {
      $set: {
        'affectedCustomers.$.notified': true,
        'affectedCustomers.$.notifiedAt': notifiedAt,
        'affectedCustomers.$.notifiedByUserId': actorId,
        'affectedCustomers.$.notifiedByName': actorName,
        'affectedCustomers.$.notificationMethod': method,
        'affectedCustomers.$.notificationReference': reference.slice(0, 500),
        'affectedCustomers.$.notificationNotes': String(req.body.notificationNotes || '').trim().slice(0, 1000)
      }
    }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ error: 'Recall changed concurrently or notification was already recorded', code: 'RECALL_UPDATE_CONFLICT' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recalls/:id/status — Update recall status
router.patch('/:id/status', authorize('manufacturing:edit'), idempotency, async (req, res) => {
  try {
    const { status, recalledQty, closureNotes } = req.body;
    const recall = await Recall.findById(req.params.id);
    if (!recall) return res.status(404).json({ error: 'Recall not found' });

    const transitions = {
      initiated: new Set(['initiated', 'in_progress']),
      in_progress: new Set(['in_progress', 'completed']),
      completed: new Set(['completed', 'closed']),
      closed: new Set(['closed'])
    };
    if (status && (!Object.prototype.hasOwnProperty.call(transitions, recall.status) || !transitions[recall.status].has(status))) {
      return res.status(409).json({ error: 'Invalid recall status transition', code: 'INVALID_RECALL_TRANSITION' });
    }
    const nextRecalledQty = recalledQty === undefined ? Number(recall.recalledQty || 0) : Number(recalledQty);
    const totalAffectedQty = Number(recall.totalAffectedQty || 0);
    if (!Number.isFinite(nextRecalledQty) || nextRecalledQty < 0 || nextRecalledQty > totalAffectedQty) {
      return res.status(400).json({ error: 'Recalled quantity must be finite and between zero and the traced distributed quantity', code: 'INVALID_RECALL_RECONCILIATION' });
    }
    const nextStatus = status || recall.status;
    const nextClosureNotes = closureNotes === undefined ? String(recall.closureNotes || '') : String(closureNotes).trim();
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!actorId || !actorName) return res.status(403).json({ error: 'Authenticated recall reviewer identity is required' });
    if (['completed', 'closed'].includes(nextStatus)) {
      if (recall.initiatedByUserId && String(recall.initiatedByUserId) === String(actorId)) {
        return res.status(403).json({ error: 'Recall initiator cannot independently complete or close the same recall', code: 'RECALL_MAKER_CHECKER_REQUIRED' });
      }
      const affected = recall.affectedCustomers || [];
      const notifiedCount = affected.filter(customer => customer.notified).length;
      if (notifiedCount !== affected.length || nextRecalledQty !== totalAffectedQty || nextClosureNotes.trim().length < 20) {
        return res.status(409).json({
          error: 'Recall completion requires documented notification for every affected invoice, full quantity reconciliation and substantive closure notes',
          code: 'RECALL_EFFECTIVENESS_EVIDENCE_INCOMPLETE',
          affectedCustomers: affected.length,
          notifiedCustomers: notifiedCount,
          totalAffectedQty,
          recalledQty: nextRecalledQty
        });
      }
    }

    const updated = await Recall.findOneAndUpdate({
      _id: recall._id,
      updatedAt: recall.updatedAt,
      status: recall.status
    }, {
      $set: {
        status: nextStatus,
        recalledQty: nextRecalledQty,
        closureNotes: nextClosureNotes,
        statusUpdatedByUserId: actorId,
        statusUpdatedByName: actorName,
        statusUpdatedAt: new Date()
      }
    }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ error: 'Recall status or evidence changed concurrently; reload before retrying', code: 'RECALL_UPDATE_CONFLICT' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recalls/:id/audit-report — Auto-generate official AYUSH Drug Inspector recall audit report JSON
router.get('/:id/audit-report', authorize('manufacturing:view'), async (req, res) => {
  try {
    const recall = await Recall.findById(req.params.id).lean();
    if (!recall) return res.status(404).json({ error: 'Recall record not found' });

    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean() || {};

    const totalAffected = recall.totalAffectedQty || 0;
    const recalled = recall.recalledQty || 0;
    const reconciliationPct = totalAffected > 0 ? Number(((recalled / totalAffected) * 100).toFixed(1)) : null;
    const notifiedCount = (recall.affectedCustomers || []).filter(c => c.notified).length;

    res.json({
      title: `Internal batch recall traceability and effectiveness report — ${recall.recallNo}`,
      reportStatus: 'INTERNAL_RECORD_NOT_A_STATUTORY_SUBMISSION',
      firmDetails: {
        ...(settings.firmName ? { name: settings.firmName } : {}),
        ...(settings.manufacturingLicenseNo ? { licenseNo: settings.manufacturingLicenseNo } : {}),
        ...(settings.gmpCertificateNo ? { gmpCertNo: settings.gmpCertificateNo } : {})
      },
      recallDetails: {
        recallNo: recall.recallNo,
        batchNo: recall.batchNo,
        productName: recall.productName,
        severityClass: recall.severity,
        reason: recall.reason,
        initiatedAt: recall.createdAt,
        initiatedBy: recall.initiatedBy,
        status: recall.status,
        closureNotes: recall.closureNotes || 'N/A'
      },
      reconciliationMetrics: {
        totalDistributedQty: totalAffected,
        recalledQty: recalled,
        unrecoveredQty: Math.max(0, totalAffected - recalled),
        reconciliationPercentage: reconciliationPct,
        reconciliationStatus: totalAffected <= 0 ? 'no_distributed_quantity_identified' :
          recalled > totalAffected ? 'over_recovered' :
            recalled === totalAffected ? 'fully_recovered' : 'partially_recovered',
        totalCustomersNotified: `${notifiedCount} of ${(recall.affectedCustomers || []).length}`
      },
      affectedDistributionList: recall.affectedCustomers || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
