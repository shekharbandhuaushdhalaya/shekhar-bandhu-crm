const config = require('../src/config');

/**
 * Escapes regex special characters safely.
 */
function safeEscapeRegex(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sends a WhatsApp notification message using Twilio (if configured).
 */
async function sendWhatsAppNotification(toPhone, messageText) {
  try {
    if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.whatsappNumber) {
      console.log(`[WhatsApp Simulated Push to ${toPhone}]: ${messageText}`);
      return { success: true, simulated: true };
    }

    const twilio = require('twilio')(config.twilio.accountSid, config.twilio.authToken);
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+91${toPhone}`;

    const res = await twilio.messages.create({
      from: `whatsapp:${config.twilio.whatsappNumber}`,
      to: `whatsapp:${formattedPhone}`,
      body: messageText
    });

    return { success: true, sid: res.sid };
  } catch (err) {
    console.error('WhatsApp Push Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  safeEscapeRegex,
  sendWhatsAppNotification
};
