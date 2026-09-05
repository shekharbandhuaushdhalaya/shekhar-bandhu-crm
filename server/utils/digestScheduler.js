const User = require('../models/User');
const { generateDailyDigestData } = require('../services/digestService');
const { sendWhatsAppNotification } = require('./whatsappService');

/**
 * Sends the Daily Executive Digest via WhatsApp to all Admin and Owner users with a phone number.
 */
async function sendDailyDigest() {
  try {
    const recipients = await User.find({
      role: { $in: ['admin', 'owner'] },
      phone: { $exists: true, $ne: '' }
    }).lean();

    const digest = await generateDailyDigestData();
    const sentResults = [];

    for (const recipient of recipients) {
      if (recipient.phone) {
        const res = await sendWhatsAppNotification(recipient.phone, digest.digestText);
        sentResults.push({ userId: recipient._id, phone: recipient.phone, res });
      }
    }

    return {
      sentCount: sentResults.length,
      recipients: sentResults,
      digestText: digest.digestText
    };
  } catch (err) {
    console.error('Failed to send daily executive digest:', err.message);
    throw err;
  }
}

module.exports = {
  sendDailyDigest
};
