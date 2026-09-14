const BroadcastCampaign = require('../models/BroadcastCampaign');
const { sendMultiChannelNotification } = require('./smsFallbackService');
const { registerJobHandler } = require('./jobQueue');

registerJobHandler('whatsapp.broadcast', async ({ broadcastId }) => {
  const campaign = await BroadcastCampaign.findById(broadcastId);
  if (!campaign) throw new Error('Broadcast campaign not found');
  campaign.status = 'processing';
  await campaign.save();

  let sent = 0;
  for (const recipient of campaign.recipients) {
    if (recipient.status === 'sent') { sent += 1; continue; }
    const result = await sendMultiChannelNotification(recipient.phone, campaign.message);
    if (result?.success) {
      recipient.status = 'sent';
      recipient.channel = result.channel || '';
      recipient.providerId = result.sid || '';
      recipient.sentAt = new Date();
      sent += 1;
    } else {
      recipient.status = 'failed';
      recipient.channel = result?.channel || '';
      recipient.error = result?.reason || 'Notification provider failed';
    }
  }
  campaign.status = sent === campaign.recipients.length ? 'completed' : (sent ? 'partial' : 'failed');
  campaign.completedAt = new Date();
  await campaign.save();
  return { sent, failed: campaign.recipients.length - sent, broadcastId: campaign._id };
});
