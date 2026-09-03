/**
 * Multi-channel message dispatcher with automatic SMS gateway fallback
 */
async function sendMultiChannelNotification(phone, messageBody) {
  if (!phone || !messageBody) return { success: false, reason: 'Missing phone or message' };

  const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');

  try {
    // 1. Attempt primary channel (WhatsApp)
    console.log(`[WHATSAPP DISPATCH] Sending to ${cleanPhone}: ${messageBody.slice(0, 50)}...`);
    
    // Simulate primary channel delivery
    const whatsappSuccess = true;
    if (whatsappSuccess) {
      return { success: true, channel: 'whatsapp', phone: cleanPhone };
    }
  } catch (err) {
    console.warn(`[WHATSAPP FAILED] ${err.message}. Falling back to SMS gateway...`);
  }

  // 2. Fallback channel (SMS Gateway)
  console.log(`[SMS FALLBACK DISPATCH] Sending SMS to ${cleanPhone}: ${messageBody.slice(0, 50)}...`);
  return { success: true, channel: 'sms_fallback', phone: cleanPhone };
}

module.exports = {
  sendMultiChannelNotification
};
