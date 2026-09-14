const express = require('express');
const { authorize } = require('../../middleware/authorize');
const BroadcastCampaign = require('../../models/BroadcastCampaign');
const { enqueue } = require('../../services/jobQueue');

const router = express.Router();

// POST /api/whatsapp-campaigns/broadcast — Send mass WhatsApp broadcast campaign
router.post('/broadcast', authorize('contact:create'), async (req, res) => {
  try {
    const { campaignTitle, messageBody, recipientPhoneNumbers } = req.body;

    if (!campaignTitle || !messageBody || !recipientPhoneNumbers || !Array.isArray(recipientPhoneNumbers) || recipientPhoneNumbers.length === 0) {
      return res.status(400).json({ error: 'campaignTitle, messageBody, and recipientPhoneNumbers array are required' });
    }

    // Clean & validate phone numbers
    const validPhones = recipientPhoneNumbers
      .map(p => (p || '').toString().trim().replace(/[^0-9+]/g, ''))
      .filter(p => p.length >= 10);

    if (!validPhones.length) return res.status(400).json({ error: 'At least one valid recipient phone number is required' });
    const campaign = await BroadcastCampaign.create({
      title: String(campaignTitle).trim(),
      message: String(messageBody).trim(),
      recipients: validPhones.map(phone => ({ phone, status: 'queued' })),
      createdBy: req.user?.id || null,
    });
    const job = await enqueue('whatsapp.broadcast', { broadcastId: campaign._id }, { firmId: campaign.firmId });

    if (req.io) {
      req.io.emit('whatsapp_broadcast', { type: 'queued', campaignId: campaign._id, recipientsCount: validPhones.length });
    }

    res.status(201).json({ campaignId: campaign._id, jobId: job._id, campaignTitle: campaign.title, totalRecipients: validPhones.length, status: campaign.status, queuedAt: campaign.queuedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
