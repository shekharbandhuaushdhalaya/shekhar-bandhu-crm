const express = require('express');
const crypto = require('crypto');
const SystemSettings = require('../../models/SystemSettings');
const WebhookEvent = require('../../models/WebhookEvent');
const Invoice = require('../../models/Invoice');
const idempotency = require('../../middleware/requiredIdempotency');
const { authorize } = require('../../middleware/authorize');
const { postGatewayPayment } = require('../../services/paymentPostingService');
const { runWithTenant, getFirmId } = require('../../utils/tenantContext');

const router = express.Router();
const money = n => Number(Number(n || 0).toFixed(2));

function secureEqualHex(a, b) {
  try {
    const aa = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
  } catch { return false; }
}

async function gatewaySettings() {
  const settings = await SystemSettings.findOne({ key: 'company_config' }).select('+razorpayKeySecret +razorpayWebhookSecret');
  return {
    settings,
    keyId: process.env.RAZORPAY_KEY_ID || settings?.razorpayKeyId,
    keySecret: process.env.RAZORPAY_KEY_SECRET || settings?.razorpayKeySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || settings?.razorpayWebhookSecret,
  };
}

router.post('/create-order', authorize('payment:create'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.body.invoiceId, type: 'sale', isFinalized: true });
    if (!invoice || !invoice.customerId) return res.status(404).json({ error: 'Finalized customer-linked Sale Invoice not found', code: 'INVALID_GATEWAY_INVOICE' });
    const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
    if (!(outstanding > 0)) return res.status(409).json({ error: 'Invoice is already paid', code: 'INVOICE_ALREADY_PAID' });
    const { settings, keyId, keySecret } = await gatewaySettings();
    if (!settings?.paymentGatewayEnabled || !keyId || !keySecret) return res.status(400).json({ error: 'Payment gateway is not configured.' });
    const firmId = getFirmId();
    if (!firmId) return res.status(500).json({ error: 'Tenant context missing', code: 'TENANT_CONTEXT_REQUIRED' });
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: Math.round(outstanding * 100), currency: 'INR', receipt: invoice.invoiceNo,
      notes: { firmId: String(firmId), invoiceId: String(invoice._id), invoiceNo: invoice.invoiceNo },
    });
    invoice.gatewayOrderId = order.id;
    await invoice.save();
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt, keyId, invoiceNo: invoice.invoiceNo, customerName: invoice.customerName || '' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/verify', idempotency, authorize('payment:create'), async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoiceId) return res.status(400).json({ error: 'Missing payment verification fields' });
    const { keySecret } = await gatewaySettings();
    if (!keySecret) return res.status(400).json({ error: 'Payment gateway not configured' });
    const expected = crypto.createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!secureEqualHex(expected, razorpay_signature)) return res.status(400).json({ error: 'Invalid payment signature', code: 'INVALID_GATEWAY_SIGNATURE' });
    const invoice = await Invoice.findOne({ _id: invoiceId, type: 'sale', isFinalized: true });
    if (!invoice || !invoice.customerId) return res.status(404).json({ error: 'Eligible invoice not found', code: 'INVALID_GATEWAY_INVOICE' });
    if (!invoice.gatewayOrderId || invoice.gatewayOrderId !== razorpay_order_id) return res.status(409).json({ error: 'Gateway order does not belong to this CRM invoice', code: 'GATEWAY_ORDER_MISMATCH' });
    const result = await postGatewayPayment({ invoice, transactionId: razorpay_payment_id, gatewayOrderId: razorpay_order_id, gatewayData: { razorpay_order_id, razorpay_payment_id, paidAt: new Date(), verified: true } });
    if (req.io) { req.io.emit('payment_updated', { type: 'gateway_verified', invoiceId: invoice._id }); req.io.emit('invoice_updated', { type: 'payment_posted', id: invoice._id }); }
    res.json({ success: true, message: 'Payment verified successfully', invoice: result.invoice, payment: result.payment });
  } catch (error) { res.status(400).json({ error: error.message, code: error.code || 'GATEWAY_VERIFY_FAILED' }); }
});

router.post('/webhook', async (req, res) => {
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const event = req.body?.event || '';
  const paymentEntity = req.body?.payload?.payment?.entity;
  const orderEntity = req.body?.payload?.order?.entity;
  const notes = orderEntity?.notes || paymentEntity?.notes || {};
  const firmId = notes.firmId;
  const invoiceId = notes.invoiceId;
  const eventId = String(req.headers['x-razorpay-event-id'] || req.body?.id || crypto.createHash('sha256').update(raw).digest('hex'));
  if (!firmId) return res.status(400).json({ error: 'Webhook missing tenant binding', code: 'TENANT_BINDING_REQUIRED' });

  try {
    const result = await runWithTenant({ firmId: String(firmId), webhook: true }, async () => {
      const { webhookSecret } = await gatewaySettings();
      if (!webhookSecret) throw Object.assign(new Error('Webhook secret is not configured for this firm'), { code: 'WEBHOOK_NOT_CONFIGURED' });
      const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
      if (!secureEqualHex(expected, req.headers['x-razorpay-signature'])) throw Object.assign(new Error('Invalid webhook signature'), { code: 'INVALID_WEBHOOK_SIGNATURE' });
      try {
        await WebhookEvent.create({ provider: 'razorpay', eventId, eventType: event, signatureValid: true, payload: req.body, status: 'received' });
      } catch (error) {
        if (error.code === 11000) return { duplicate: true };
        throw error;
      }
      if (['payment.captured','order.paid'].includes(event) && invoiceId) {
        const invoice = await Invoice.findOne({ _id: invoiceId, type: 'sale', isFinalized: true });
        if (!invoice || !invoice.customerId) throw Object.assign(new Error('Webhook invoice is not eligible'), { code: 'INVALID_GATEWAY_INVOICE' });
        const paymentId = paymentEntity?.id;
        const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id;
        if (!invoice.gatewayOrderId || invoice.gatewayOrderId !== gatewayOrderId) throw Object.assign(new Error('Webhook gateway order does not match invoice'), { code: 'GATEWAY_ORDER_MISMATCH' });
        const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
        if (outstanding > 0 && paymentId) {
          try {
            await postGatewayPayment({ invoice, amount: Math.min(outstanding, Number(paymentEntity?.amount || orderEntity?.amount_paid || 0) / 100 || outstanding), transactionId: paymentId, gatewayOrderId, gatewayData: { event, webhook: true, capturedAt: new Date() } });
          } catch (error) {
            if (error?.code !== 11000) throw error;
            // A distinct provider event can repeat the same transaction ID;
            // the unique Payment gatewayTransactionId makes that a safe no-op.
          }
        }
      }
      await WebhookEvent.updateOne({ provider: 'razorpay', eventId }, { $set: { status: 'processed', processedAt: new Date() } });
      return { duplicate: false };
    });
    if (result.duplicate) return res.json({ status: 'ok', duplicate: true });
    if (req.io?.toFirm) req.io.toFirm(String(firmId), 'payment_updated', { type: 'gateway_webhook', invoiceId });
    res.json({ status: 'ok' });
  } catch (error) {
    await runWithTenant({ firmId: String(firmId), webhook: true }, () => WebhookEvent.updateOne({ provider: 'razorpay', eventId }, { $set: { status: 'failed', lastError: error.message }, $inc: { attempts: 1 } })).catch(() => {});
    res.status(error.code === 'INVALID_WEBHOOK_SIGNATURE' ? 400 : 500).json({ error: error.message, code: error.code || 'WEBHOOK_PROCESSING_FAILED' });
  }
});

module.exports = router;
