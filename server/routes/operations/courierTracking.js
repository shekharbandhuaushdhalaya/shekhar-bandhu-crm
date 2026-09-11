const express = require('express');
const crypto = require('crypto');
const WebhookEvent = require('../../models/WebhookEvent');
const Dispatch = require('../../models/Dispatch');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/logistics/track/:trackingId — Track courier shipment by tracking ID / LR number
router.get('/track/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const dispatch = await Dispatch.findOne({
      $or: [{ trackingId: trackingId.trim() }, { lrNo: trackingId.trim() }]
    }).lean();

    if (!dispatch) {
      return res.status(404).json({ error: 'Shipment record not found for this tracking number' });
    }

    const trackingStatus = {
      dispatchNo: dispatch.dispatchNo,
      courierName: dispatch.courierName || dispatch.transporter || 'Express Carrier',
      trackingId: dispatch.trackingId || dispatch.lrNo,
      status: dispatch.status || 'in_transit',
      currentLocation: 'Transit Hub Varanasi',
      estimatedDeliveryDate: dispatch.deliveryDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      trackingUrl: dispatch.trackingUrl || `https://track.courier.com/${trackingId}`
    };

    res.json(trackingStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logistics/webhook — Carrier status updates webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.COURIER_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Courier webhook is not configured' });
    const provided = req.headers['x-webhook-signature'] || '';
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!provided || !crypto.timingSafeEqual(Buffer.from(String(provided)), Buffer.from(expected))) return res.status(401).json({ error: 'Invalid webhook signature' });
    const eventId = req.headers['x-event-id'] || crypto.createHash('sha256').update(raw).digest('hex');
    try { await WebhookEvent.create({ provider: 'courier', eventId: String(eventId), eventType: req.body.status || '', signatureValid: true, payload: req.body }); } catch (e) { if (e.code === 11000) return res.json({ success: true, duplicate: true }); throw e; }
    const { trackingId, status, currentLocation } = req.body;
    if (!trackingId || !status) {
      return res.status(400).json({ error: 'trackingId and status are required' });
    }

    const dispatch = await Dispatch.findOne({
      $or: [{ trackingId: trackingId.trim() }, { lrNo: trackingId.trim() }]
    });

    if (dispatch) {
      dispatch.status = status;
      if (status === 'delivered') dispatch.deliveryDate = new Date();
      await dispatch.save();
    }

    res.json({ success: true, message: 'Logistics webhook processed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
