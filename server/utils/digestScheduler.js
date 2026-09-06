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

/**
 * Scans Doctor collection daily for birthdays & anniversaries and dispatches automated greetings.
 */
async function sendDoctorGreetings() {
  try {
    const Doctor = require('../models/Doctor');
    const Notification = require('../models/Notification');
    const { sendMultiChannelNotification } = require('../services/smsFallbackService');

    const today = new Date();
    const targetMonth = today.getMonth() + 1; // 1-indexed
    const targetDay = today.getDate();

    const doctors = await Doctor.find({
      $or: [
        { birthday: { $ne: null } },
        { anniversary: { $ne: null } }
      ]
    }).populate('assignedMrId', 'name phone').lean();

    const sentGreetings = [];

    for (const doc of doctors) {
      if (!doc.phone) continue;

      const mrName = doc.assignedMrId?.name || 'Shekhar Bandhu Aushdhalaya Team';

      // Birthday Check
      if (doc.birthday) {
        const bdate = new Date(doc.birthday);
        if (bdate.getMonth() + 1 === targetMonth && bdate.getDate() === targetDay) {
          const message = `Warmest Birthday Wishes to Dr. ${doc.name}! Wishing you health, happiness and success in your noble healing practice. — Greetings from ${mrName} & Shekhar Bandhu Aushdhalaya.`;
          await sendMultiChannelNotification(doc.phone, message);
          await Notification.create({
            title: `🎂 Birthday Greeting Dispatched: Dr. ${doc.name}`,
            message,
            category: 'doctor_event',
            recipientPhone: doc.phone
          });
          sentGreetings.push({ doctorId: doc._id, type: 'Birthday', phone: doc.phone });
        }
      }

      // Anniversary Check
      if (doc.anniversary) {
        const adate = new Date(doc.anniversary);
        if (adate.getMonth() + 1 === targetMonth && adate.getDate() === targetDay) {
          const message = `Happy Anniversary to Dr. ${doc.name}! Wishing you another wonderful year of togetherness and joy. — Warm regards from ${mrName} & Shekhar Bandhu Aushdhalaya.`;
          await sendMultiChannelNotification(doc.phone, message);
          await Notification.create({
            title: `💐 Anniversary Greeting Dispatched: Dr. ${doc.name}`,
            message,
            category: 'doctor_event',
            recipientPhone: doc.phone
          });
          sentGreetings.push({ doctorId: doc._id, type: 'Anniversary', phone: doc.phone });
        }
      }
    }

    return {
      sentCount: sentGreetings.length,
      greetings: sentGreetings
    };
  } catch (err) {
    console.error('Failed to send automated doctor greetings:', err.message);
    return { sentCount: 0, greetings: [] };
  }
}

module.exports = {
  sendDailyDigest,
  sendDoctorGreetings
};
