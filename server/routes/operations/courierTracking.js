const express = require('express');
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
