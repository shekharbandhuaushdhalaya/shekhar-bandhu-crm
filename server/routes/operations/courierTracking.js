const express = require('express');
const crypto = require('crypto');
const WebhookEvent = require('../../models/WebhookEvent');
const Dispatch = require('../../models/Dispatch');
const { publicTenant } = require('../../middleware/publicTenant');
const { runWithTenant } = require('../../utils/tenantContext');
const { recomputeOrderLogisticsFromChallan } = require('../../services/dispatchService');

const router = express.Router();
const allowedStatuses = new Set(['pending','dispatched','in_transit','out_for_delivery','delivered','returned']);

function safeHexEqual(provided, expected) {
  try {
    const a = Buffer.from(String(provided || ''), 'hex');
    const b = Buffer.from(String(expected || ''), 'hex');
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// Public tracking is storefront-tenant scoped. It exposes only logistics-safe fields.
router.get('/track/:trackingId', publicTenant, async (req, res) => {
  try {
    const trackingId = String(req.params.trackingId || '').trim();
    if (!trackingId) return res.status(400).json({ error: 'Tracking number is required' });
    const dispatch = await Dispatch.findOne({ $or: [{ trackingId }, { lrNo: trackingId }] }).lean();
    if (!dispatch) return res.status(404).json({ error: 'Shipment record not found for this tracking number' });
    res.json({
      dispatchNo: dispatch.dispatchNo,
      challanNo: dispatch.challanNo || '',
      courierName: dispatch.courierName || dispatch.transporter || 'Carrier',
      trackingId: dispatch.trackingId || dispatch.lrNo,
      status: dispatch.status || 'in_transit',
      trackingUrl: dispatch.trackingUrl || '',
      dispatchedAt: dispatch.dispatchDate || dispatch.createdAt,
      deliveredAt: dispatch.deliveredAt || null,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Carrier webhook: signed globally, then bound to the tenant that owns the tracking record.
router.post('/webhook', async (req, res) => {
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  try {
    const secret = process.env.COURIER_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Courier webhook is not configured' });
    const provided = req.headers['x-webhook-signature'] || '';
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!safeHexEqual(provided, expected)) return res.status(401).json({ error: 'Invalid webhook signature' });

    const trackingId = String(req.body?.trackingId || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!trackingId || !allowedStatuses.has(status)) return res.status(400).json({ error: 'Valid trackingId and status are required' });

    // Resolve tenant ownership from the physical dispatch record without running an unscoped model query.
    const rawDispatch = await Dispatch.collection.findOne({ $or: [{ trackingId }, { lrNo: trackingId }] }, { projection: { _id: 1, firmId: 1 } });
    if (!rawDispatch?.firmId) return res.status(404).json({ error: 'Shipment record not found' });
    const firmId = String(rawDispatch.firmId);
    const eventId = String(req.headers['x-event-id'] || crypto.createHash('sha256').update(raw).digest('hex'));

    const outcome = await runWithTenant({ firmId, webhook: true }, async () => {
      try {
        await WebhookEvent.create({ provider: 'courier', eventId, eventType: status, signatureValid: true, payload: req.body, status: 'received' });
      } catch (error) {
        if (error.code === 11000) return { duplicate: true };
        throw error;
      }
      const dispatch = await Dispatch.findOne({ _id: rawDispatch._id });
      if (!dispatch) return { missing: true };
      dispatch.status = status;
      if (req.body.courierName) dispatch.courierName = String(req.body.courierName).slice(0, 120);
      if (req.body.trackingUrl) dispatch.trackingUrl = String(req.body.trackingUrl).slice(0, 500);
      if (status === 'delivered' && !dispatch.deliveredAt) dispatch.deliveredAt = new Date();
      await dispatch.save();
      if (dispatch.challanId) await recomputeOrderLogisticsFromChallan(dispatch.challanId);
      await WebhookEvent.updateOne({ provider: 'courier', eventId }, { $set: { status: 'processed', processedAt: new Date() } });
      return { dispatch, duplicate: false };
    });

    if (outcome.duplicate) return res.json({ success: true, duplicate: true });
    if (req.io?.toFirm && outcome.dispatch) req.io.toFirm(firmId, 'dispatch_updated', { type: 'courier_webhook', id: outcome.dispatch._id });
    return res.json({ success: true, message: 'Logistics webhook processed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
