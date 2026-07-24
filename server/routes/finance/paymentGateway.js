const express = require('express');
const SystemSettings = require('../../models/SystemSettings');
const Invoice = require('../../models/Invoice');
const router = express.Router();

// POST /api/payments/gateway/create-order — Create a Razorpay order for an invoice
router.post('/create-order', async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required' });

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid' });

    const settings = await SystemSettings.findOne({ key: 'company_config' });
    if (!settings || !settings.paymentGatewayEnabled || !settings.razorpayKeyId || !settings.razorpayKeySecret) {
      return res.status(400).json({ error: 'Payment gateway is not configured. Please configure Razorpay keys in Firm Settings.' });
    }

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: settings.razorpayKeyId,
      key_secret: settings.razorpayKeySecret,
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
      keyId: settings.razorpayKeyId,
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
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !invoiceId) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }

    const settings = await SystemSettings.findOne({ key: 'company_config' });
    if (!settings || !settings.razorpayKeySecret) {
      return res.status(400).json({ error: 'Payment gateway not configured' });
    }

    const crypto = require('crypto');
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', settings.razorpayKeySecret)
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
    const secret = (await SystemSettings.findOne({ key: 'company_config' }))?.razorpayWebhookSecret;
    if (!secret) return res.status(200).json({ status: 'ignored', reason: 'Webhook not configured' });

    const crypto = require('crypto');
    const bodyToSign = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    const shasum = crypto.createHmac('sha256', secret).update(bodyToSign).digest('hex');
    if (shasum !== req.headers['x-razorpay-signature']) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
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
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
