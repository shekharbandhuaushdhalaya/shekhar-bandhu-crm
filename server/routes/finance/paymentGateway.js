const express = require('express');
const SystemSettings = require('../../models/SystemSettings');
const WebhookEvent = require('../../models/WebhookEvent');
const idempotency = require('../../middleware/idempotency');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');
const router = express.Router();

// POST /api/payments/gateway/create-order — Create a Razorpay order for an invoice
router.post('/create-order', authorize('payment:create'), async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required' });

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid' });

    const settings = await SystemSettings.findOne({ key: 'company_config' }).select('+razorpayKeySecret +razorpayWebhookSecret');
    const keyId = process.env.RAZORPAY_KEY_ID || settings?.razorpayKeyId;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || settings?.razorpayKeySecret;
    if (!settings || !settings.paymentGatewayEnabled || !keyId || !keySecret) {
      return res.status(400).json({ error: 'Payment gateway is not configured. Please configure Razorpay keys in Firm Settings.' });
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const amountPaise = Math.round(invoice.amount * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: invoice.invoiceNo,
      notes: {
        invoiceId: invoice._id.toString(),
        invoiceNo: invoice.invoiceNo,
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      keyId,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customerName || invoice.supplierName || '',
      customerEmail: '',
      customerPhone: '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/gateway/verify — Verify a Razorpay payment signature
router.post('/verify', idempotency, authorize('payment:create'), async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoiceId) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    const settings = await SystemSettings.findOne({ key: 'company_config' }).select('+razorpayKeySecret +razorpayWebhookSecret');
    const keySecret = process.env.RAZORPAY_KEY_SECRET || settings?.razorpayKeySecret;
    if (!keySecret) {
      return res.status(400).json({ error: 'Payment gateway not configured' });
    }

    const crypto = require('crypto');
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    invoice.status = 'paid';
    invoice.paymentTransactionId = razorpay_payment_id;
    invoice.paymentGatewayData = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paidAt: new Date(),
    };
    await invoice.save();

    if (req.io) {
      req.io.emit('payment_updated', { type: 'gateway_verified', invoiceId: invoice._id });
      req.io.emit('invoice_updated', { type: 'paid', id: invoice._id });
    }
    res.json({
      success: true,
      message: 'Payment verified successfully',
      invoice: {
        _id: invoice._id,
        invoiceNo: invoice.invoiceNo,
        status: invoice.status,
        paymentTransactionId: invoice.paymentTransactionId,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/gateway/webhook — Razorpay webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const settings = await SystemSettings.findOne({ key: 'company_config' }).select('+razorpayWebhookSecret');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || settings?.razorpayWebhookSecret;
    if (!secret) return res.status(200).json({ status: 'ignored', reason: 'Webhook not configured' });

    const crypto = require('crypto');
    const bodyToSign = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    const shasum = crypto.createHmac('sha256', secret).update(bodyToSign).digest('hex');
    if (shasum !== req.headers['x-razorpay-signature']) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const eventId = req.headers['x-razorpay-event-id'] || req.body.id || crypto.createHash('sha256').update(bodyToSign).digest('hex');
    try {
      await WebhookEvent.create({ provider: 'razorpay', eventId: String(eventId), eventType: event, signatureValid: true, payload: req.body, status: 'received' });
    } catch (e) {
      if (e.code === 11000) return res.json({ status: 'ok', duplicate: true });
      throw e;
    }
    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = req.body.payload;
      const paymentEntity = payload?.payment?.entity;
      const notes = paymentEntity?.notes || {};
      const invoiceId = notes.invoiceId;

      if (invoiceId) {
        const invoice = await Invoice.findById(invoiceId);
        if (invoice && invoice.status !== 'paid') {
          invoice.status = 'paid';
          invoice.paymentTransactionId = paymentEntity.id;
          invoice.paymentGatewayData = {
            razorpay_order_id: paymentEntity.order_id,
            razorpay_payment_id: paymentEntity.id,
            event,
            paidAt: new Date(),
            webhook: true,
          };
          await invoice.save();
          if (req.io) {
            req.io.emit('payment_updated', { type: 'webhook_payment', invoiceId: invoice._id });
            req.io.emit('invoice_updated', { type: 'paid', id: invoice._id });
          }
        }
      }
    }

    await WebhookEvent.updateOne({ provider: 'razorpay', eventId: String(eventId) }, { $set: { status: 'processed', processedAt: new Date() } });
    res.json({ status: 'ok' });
  } catch (err) {
    if (typeof eventId !== 'undefined') await WebhookEvent.updateOne({ provider: 'razorpay', eventId: String(eventId) }, { $set: { status: 'failed', lastError: err.message }, $inc: { attempts: 1 } }).catch(() => {});
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
