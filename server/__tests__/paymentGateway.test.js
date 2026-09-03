const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const SystemSettings = require('../models/SystemSettings');
const Invoice = require('../models/Invoice');
const paymentGatewayRouter = require('../routes/finance/paymentGateway');

jest.mock('../models/SystemSettings');
jest.mock('../models/Invoice');
jest.mock('../models/RolePermission', () => ({
  getEffectivePermissions: jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] }),
}));

describe('Payment Gateway - Money Critical Paths', () => {
  let app;

  beforeAll(() => {
    app = express();
    // Middleware to parse JSON and store rawBody (matching server.js setup)
    app.use(express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    app.use((req, res, next) => {
      req.user = { role: 'admin' };
      next();
    });
    app.use('/api/payments/gateway', paymentGatewayRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/payments/gateway/verify', () => {
    test('successfully verifies valid Razorpay payment signature', async () => {
      const mockInvoice = {
        _id: '507f1f77bcf86cd799439011',
        invoiceNo: 'INV-1001',
        status: 'unpaid',
        save: jest.fn().mockResolvedValue(true),
      };

      const mockSettings = {
        razorpayKeySecret: 'test_secret_key',
      };

      SystemSettings.findOne.mockResolvedValue(mockSettings);
      Invoice.findById.mockResolvedValue(mockInvoice);

      const razorpay_order_id = 'order_abc123';
      const razorpay_payment_id = 'pay_xyz789';
      const bodyToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
      const razorpay_signature = crypto
        .createHmac('sha256', mockSettings.razorpayKeySecret)
        .update(bodyToSign)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/gateway/verify')
        .send({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          invoiceId: mockInvoice._id,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockInvoice.status).toBe('paid');
      expect(mockInvoice.paymentTransactionId).toBe(razorpay_payment_id);
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    test('fails verification on invalid payment signature', async () => {
      const mockSettings = {
        razorpayKeySecret: 'test_secret_key',
      };

      SystemSettings.findOne.mockResolvedValue(mockSettings);

      const response = await request(app)
        .post('/api/payments/gateway/verify')
        .send({
          razorpay_order_id: 'order_abc123',
          razorpay_payment_id: 'pay_xyz789',
          razorpay_signature: 'invalid_signature',
          invoiceId: '507f1f77bcf86cd799439011',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid payment signature');
    });
  });

  describe('POST /api/payments/gateway/webhook', () => {
    test('successfully processes valid webhook with matching rawBody signature', async () => {
      const mockInvoice = {
        _id: '507f1f77bcf86cd799439011',
        status: 'unpaid',
        save: jest.fn().mockResolvedValue(true),
      };

      const mockSettings = {
        razorpayWebhookSecret: 'webhook_secret_key',
      };

      SystemSettings.findOne.mockResolvedValue(mockSettings);
      Invoice.findById.mockResolvedValue(mockInvoice);

      const payloadBody = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook123',
              order_id: 'order_webhook456',
              notes: {
                invoiceId: '507f1f77bcf86cd799439011',
              },
            },
          },
        },
      };

      const rawPayloadString = JSON.stringify(payloadBody);
      const signature = crypto
        .createHmac('sha256', mockSettings.razorpayWebhookSecret)
        .update(Buffer.from(rawPayloadString))
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/gateway/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawPayloadString);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(mockInvoice.status).toBe('paid');
      expect(mockInvoice.paymentTransactionId).toBe('pay_webhook123');
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    test('rejects webhook on invalid signature', async () => {
      const mockSettings = {
        razorpayWebhookSecret: 'webhook_secret_key',
      };

      SystemSettings.findOne.mockResolvedValue(mockSettings);

      const response = await request(app)
        .post('/api/payments/gateway/webhook')
        .set('x-razorpay-signature', 'bad_signature')
        .send({ event: 'payment.captured' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid webhook signature');
    });
  });
});
