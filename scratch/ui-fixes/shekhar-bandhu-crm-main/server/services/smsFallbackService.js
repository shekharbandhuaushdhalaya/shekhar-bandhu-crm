/**
 * Multi-channel message dispatcher with automatic SMS gateway fallback
 */
const { sendWhatsAppNotification } = require('../utils/whatsappService');

async function sendMultiChannelNotification(phone, messageBody) {
  if (!phone || !messageBody) return { success: false, reason: 'Missing phone or message' };

  const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');

  try {
    // 1. Attempt the configured primary channel. In production the provider
    // helper fails closed when credentials are absent; never report a fake
    // WhatsApp/SMS delivery as successful.
    const delivery = await sendWhatsAppNotification(cleanPhone, messageBody);
    if (delivery?.success) return { ...delivery, channel: 'whatsapp', phone: cleanPhone };
    if (process.env.NODE_ENV === 'production') return { success: false, channel: 'whatsapp', phone: cleanPhone, reason: delivery?.error || 'WhatsApp delivery failed' };
  } catch (err) {
    console.warn(`[WHATSAPP FAILED] ${err.message}. Falling back to SMS gateway...`);
  }

  // 2. A real SMS provider can be added here. Until then, non-production
  // environments may simulate the fallback, but production must fail closed.
  if (process.env.NODE_ENV === 'production') return { success: false, channel: 'sms_fallback', phone: cleanPhone, reason: 'SMS provider is not configured' };
  console.log(`[SMS FALLBACK SIMULATED to ${cleanPhone}]: ${messageBody.slice(0, 50)}...`);
  return { success: true, simulated: true, channel: 'sms_fallback', phone: cleanPhone };
}

module.exports = {
  sendMultiChannelNotification
};
