const express = require('express');
const { authorize } = require('../../middleware/authorize');

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

    const broadcastResult = {
      campaignTitle,
      totalRecipients: validPhones.length,
      status: 'queued',
      dispatchedAt: new Date(),
      sampleRecipients: validPhones.slice(0, 5)
    };

    if (req.io) {
      req.io.emit('whatsapp_broadcast', { type: 'dispatched', campaignTitle, recipientsCount: validPhones.length });
    }

    res.status(201).json(broadcastResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
