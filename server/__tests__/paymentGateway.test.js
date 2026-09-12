const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const SystemSettings = require('../models/SystemSettings');
const Invoice = require('../models/Invoice');
const { postGatewayPayment } = require('../services/paymentPostingService');
const paymentGatewayRouter = require('../routes/finance/paymentGateway');

jest.mock('../models/SystemSettings');
jest.mock('../models/Invoice');
jest.mock('../services/paymentPostingService', () => ({ postGatewayPayment: jest.fn() }));
jest.mock('../models/WebhookEvent', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'mock_event_id' }),
  updateOne: jest.fn().mockResolvedValue({ nModified: 1 }),
}));
jest.mock('../models/RolePermission', () => ({
  getEffectivePermissions: jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] }),
}));

const mockFindOne = (settingsObj) => ({
  select: jest.fn().mockResolvedValue(settingsObj),
  then: (resolve) => Promise.resolve(settingsObj).then(resolve)
});

describe('Payment Gateway - Money Critical Paths', () => {
  let app;

  beforeAll(() => {
    app = express();
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
        customerId: '507f1f77bcf86cd799439012',
        type: 'sale',
        isFinalized: true,
        status: 'unpaid',
        gatewayOrderId: 'order_abc123',
        save: jest.fn().mockResolvedValue(true),
      };

      const mockSettings = {
        razorpayKeySecret: 'test_secret_key',
      };

      SystemSettings.findOne.mockReturnValue(mockFindOne(mockSettings));
      Invoice.findOne.mockResolvedValue(mockInvoice);
      postGatewayPayment.mockResolvedValue({ invoice: { ...mockInvoice, status: 'paid' }, payment: { _id: 'payment-1' } });

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
      expect(postGatewayPayment).toHaveBeenCalledWith(expect.objectContaining({
        invoice: mockInvoice,
        transactionId: razorpay_payment_id,
        gatewayOrderId: razorpay_order_id,
      }));
    });

    test('fails verification on invalid payment signature', async () => {
      const mockSettings = {
        razorpayKeySecret: 'test_secret_key',
      };

      SystemSettings.findOne.mockReturnValue(mockFindOne(mockSettings));

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
        customerId: '507f1f77bcf86cd799439012',
        type: 'sale',
        isFinalized: true,
        status: 'unpaid',
        amount: 100,
        amountPaid: 0,
        gatewayOrderId: 'order_webhook456',
        save: jest.fn().mockResolvedValue(true),
      };

      const mockSettings = {
        razorpayWebhookSecret: 'webhook_secret_key',
      };

      SystemSettings.findOne.mockReturnValue(mockFindOne(mockSettings));
      Invoice.findOne.mockResolvedValue(mockInvoice);
      postGatewayPayment.mockResolvedValue({ invoice: { ...mockInvoice, status: 'paid' }, payment: { _id: 'payment-2' } });

      const payloadBody = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook123',
              order_id: 'order_webhook456',
              notes: {
                firmId: '507f1f77bcf86cd799439099',
                invoiceId: '507f1f77bcf86cd799439011',
              },
              amount: 10000,
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
      expect(postGatewayPayment).toHaveBeenCalledWith(expect.objectContaining({
        invoice: mockInvoice,
        transactionId: 'pay_webhook123',
        gatewayOrderId: 'order_webhook456',
      }));
    });

    test('rejects webhook on invalid signature', async () => {
      const mockSettings = {
        razorpayWebhookSecret: 'webhook_secret_key',
      };

      SystemSettings.findOne.mockReturnValue(mockFindOne(mockSettings));

      const response = await request(app)
        .post('/api/payments/gateway/webhook')
        .set('x-razorpay-signature', 'bad_signature')
        .send({
          event: 'payment.captured',
          payload: { payment: { entity: { notes: { firmId: '507f1f77bcf86cd799439099' } } } }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid webhook signature');
    });
  });
});
