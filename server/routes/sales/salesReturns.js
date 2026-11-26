const express = require('express');
const SalesReturn = require('../../models/SalesReturn');
const {
  createSalesReturn, postSalesReturn, reverseSalesReturn, dispositionSalesReturnItem
} = require('../../services/salesReturnService');
const { authorize } = require('../../middleware/authorize');
const idempotency = require('../../middleware/requiredIdempotency');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();

function actorFrom(req) {
  return { id: req.user?.id || req.user?._id || null, name: req.user?.name || req.user?.email || '' };
}

function statusFor(error) {
  if (['RETURN_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'WAREHOUSE_NOT_FOUND', 'CUSTOMER_NOT_FOUND'].includes(error.code)) return 404;
  if (['RETURN_NOT_POSTABLE','RETURN_NOT_REVERSIBLE','RETURN_NOT_POSTED','RETURN_QC_MAKER_CHECKER_REQUIRED',
    'RETURN_QC_ALREADY_DISPOSITIONED','RETURN_QC_HOLD_STOCK_MISSING','RETURN_REVERSAL_MAKER_CHECKER_REQUIRED',
    'ORIGINAL_CHALLAN_REQUIRED','FINALIZED_INVOICE_REQUIRED','REFUND_WORKFLOW_REQUIRED'].includes(error.code) ||
    String(error.code || '').includes('EXCEEDS') || String(error.code || '').includes('CONFLICT')) return 409;
  return 400;
}

router.get('/', authorize('salesreturn:view'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.challanId) filter.challanId = req.query.challanId;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    res.json(await SalesReturn.find(filter).sort({ createdAt: -1 }).lean());
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', authorize('salesreturn:create'), idempotency, async (req, res) => {
  try {
    const actor = actorFrom(req);
    if (!actor.id || !actor.name) return res.status(403).json({ error: 'Authenticated return requester identity is required' });
    if (!req.body.challanId || !Array.isArray(req.body.items) || !req.body.items.length) {
      return res.status(400).json({ error: 'Original posted Challan and at least one returned line are required', code: 'RETURN_SOURCE_AND_ITEMS_REQUIRED' });
    }
    const result = await createSalesReturn(req.body, actor);
    await logAction({ action: 'CREATE_SALES_RETURN', description: `Created Sales Return draft ${result.returnNo}`, details: { id: result._id, challanId: result.challanId }, req });
    res.status(201).json(result);
  } catch (error) { res.status(statusFor(error)).json({ error: error.message, code: error.code || 'SALES_RETURN_CREATE_FAILED' }); }
});

router.patch('/:id/post', authorize('salesreturn:post'), idempotency, async (req, res) => {
  try {
    const actor = actorFrom(req);
    if (!actor.id || !actor.name) return res.status(403).json({ error: 'Authenticated posting identity is required' });
    const result = await postSalesReturn(req.params.id, actor);
    const postedReturn = result.return || result;
    await logAction({ action: 'POST_SALES_RETURN', description: `Posted Sales Return ${postedReturn.returnNo}`, details: { id: postedReturn._id, creditNoteId: result.creditNote?._id || postedReturn.creditNoteId }, req });
    res.json(result);
  } catch (error) { res.status(statusFor(error)).json({ error: error.message, code: error.code || 'SALES_RETURN_POST_FAILED' }); }
});

router.patch('/:id/items/:itemIndex/disposition', authorize('quality:approve'), idempotency, async (req, res) => {
  try {
    const actor = actorFrom(req);
    if (!actor.id || !actor.name) return res.status(403).json({ error: 'Authenticated QA reviewer identity is required' });
    const result = await dispositionSalesReturnItem(req.params.id, req.params.itemIndex, {
      disposition: req.body.disposition, notes: req.body.notes, actor
    });
    await logAction({ action: 'DISPOSITION_SALES_RETURN_QC',
      description: `Recorded ${req.body.disposition} QA disposition for Sales Return ${result.returnNo}, line ${req.params.itemIndex}`,
      details: { id: result._id, itemIndex: Number(req.params.itemIndex), disposition: req.body.disposition }, req });
    res.json(result);
  } catch (error) { res.status(statusFor(error)).json({ error: error.message, code: error.code || 'SALES_RETURN_QC_FAILED' }); }
});

router.patch('/:id/reverse', authorize('salesreturn:reverse'), idempotency, async (req, res) => {
  try {
    const actor = actorFrom(req);
    const reason = String(req.body.reason || '').trim();
    if (!actor.id || !actor.name) return res.status(403).json({ error: 'Authenticated reversal identity is required' });
    if (reason.length < 10) return res.status(400).json({ error: 'A substantive reversal reason of at least 10 characters is required', code: 'RETURN_REVERSAL_REASON_REQUIRED' });
    const result = await reverseSalesReturn(req.params.id, actor, reason);
    await logAction({ action: 'REVERSE_SALES_RETURN', description: `Reversed Sales Return ${result.returnNo}: ${reason}`, details: { id: result._id }, req });
    res.json(result);
  } catch (error) { res.status(statusFor(error)).json({ error: error.message, code: error.code || 'SALES_RETURN_REVERSAL_FAILED' }); }
});

module.exports = router;
