const EmailLog = require('../models/EmailLog');
async function sendEmail({ to, subject, html, text, firmId }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Email provider is not configured');
  const log = await EmailLog.create({ to, subject, from: process.env.EMAIL_FROM, firmId, status: 'queued' });
  try {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `Email provider HTTP ${res.status}`);
    await EmailLog.updateOne({ _id: log._id }, { $set: { status: 'sent', providerId: data.id || '', sentAt: new Date() } });
    return data;
  } catch (err) { await EmailLog.updateOne({ _id: log._id }, { $set: { status: 'failed', error: err.message } }); throw err; }
}
module.exports = { sendEmail };
